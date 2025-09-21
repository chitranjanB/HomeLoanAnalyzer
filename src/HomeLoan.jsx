import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

/** ---------- Utilities ---------- **/

// robust INR formatter
function formatINR(num) {
  const n = Number.isFinite(num) ? num : 0;
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// safe number parser
function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** ---------- Core Component ---------- **/

export default function HomeLoanAnalyzer() {
  /** Inputs */
  const [loanAmount, setLoanAmount] = useState(7500000);
  const [tenureYears, setTenureYears] = useState(25);
  const [tenureMonths, setTenureMonths] = useState(0);
  const [annualRate, setAnnualRate] = useState(7.7);
  const [emiStartDate, setEmiStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Prepayment
  const [oneTimePrepayAmt, setOneTimePrepayAmt] = useState("");
  const [oneTimePrepayDate, setOneTimePrepayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recurringPrepayAmt, setRecurringPrepayAmt] = useState("100000");
  const [recurringPrepayFreq, setRecurringPrepayFreq] = useState("yearly"); // monthly|quarterly|yearly

  // Savings offset
  const [linkSavings, setLinkSavings] = useState(true);
  const [savingsBalance, setSavingsBalance] = useState(100000);
  const [savingsGrowthMonthly, setSavingsGrowthMonthly] = useState(10000);

  // Quick “what-if”
  const [whatIfSavings, setWhatIfSavings] = useState(100000);
  const [whatIfOneTime, setWhatIfOneTime] = useState("");

  const [selectedScenario, setSelectedScenario] = useState("base");

  const totalMonths = useMemo(
    () => toNum(tenureYears) * 12 + toNum(tenureMonths),
    [tenureYears, tenureMonths]
  );

  /** ---------- Financial Math ---------- **/

  function monthlyEMI(P, rAnnual, nMonths) {
    const principal = Math.max(0, toNum(P));
    const n = Math.max(1, toNum(nMonths, 1));
    const r = toNum(rAnnual) / 12 / 100;
    if (r === 0) return principal / n;
    const pow = Math.pow(1 + r, n);
    return (principal * r * pow) / (pow - 1);
  }

  /**
   * Build amortization schedule with:
   * - one-time prepay (on matching year-month)
   * - recurring prepay (monthly/quarterly/yearly)
   * - savings “offset” (reduce interest-bearing principal by savings)
   * Notes:
   * - Savings change is applied at end of month for next month’s interest calc
   */
  function buildSchedule({
    principal,
    months,
    annualRate,
    emiStartISO,
    oneTimePrepay = 0,
    oneTimePrepayDateISO = null,
    recurringPrepay = 0,
    recurringFreq = "yearly",
    recurringStart = 2, // start after month 1 by default
    savingsLink = false,
    savingsInit = 0,
    savingsMonthlyDrift = 0,
  }) {
    const schedule = [];
    let outstanding = Math.max(0, toNum(principal));
    const monthlyRate = toNum(annualRate) / 12 / 100;
    const emi = monthlyEMI(outstanding, annualRate, months);
    const startDate = new Date(emiStartISO);
    const interval = recurringFreq === "monthly" ? 1 : recurringFreq === "quarterly" ? 3 : 12;
    let currSavings = Math.max(0, toNum(savingsInit));

    for (let m = 1; m <= months && outstanding > 0.0001; m++) {
      const date = new Date(startDate);
      date.setMonth(startDate.getMonth() + (m - 1));

      // One-time prepayment in matching month
      if (oneTimePrepayDateISO) {
        const otp = new Date(oneTimePrepayDateISO);
        if (otp.getFullYear() === date.getFullYear() && otp.getMonth() === date.getMonth()) {
          outstanding = Math.max(0, outstanding - Math.max(0, toNum(oneTimePrepay)));
        }
      }

      // Recurring prepayment
      if (toNum(recurringPrepay) > 0 && m >= recurringStart && (m - recurringStart) % interval === 0) {
        outstanding = Math.max(0, outstanding - Math.max(0, toNum(recurringPrepay)));
      }

      // Effective principal for interest calculation (offset)
      const effectivePrincipal = savingsLink ? Math.max(0, outstanding - currSavings) : outstanding;

      // Interest for this month
      const interestPayment = effectivePrincipal * monthlyRate;

      // Principal portion of EMI
      let principalPayment = emi - interestPayment;
      if (principalPayment > outstanding) principalPayment = outstanding;
      if (principalPayment < 0) principalPayment = 0;

      const payment = principalPayment + interestPayment;
      outstanding = Math.max(0, outstanding - principalPayment);

      schedule.push({
        month: m,
        date: date.toISOString().slice(0, 10),
        payment: Number(payment.toFixed(2)),
        principalPaid: Number(principalPayment.toFixed(2)),
        interestPaid: Number(interestPayment.toFixed(2)),
        balance: Number(outstanding.toFixed(2)),
        savingsLinked: Number(currSavings.toFixed(2)),
      });

      // Savings drift for next month
      currSavings = Math.max(0, currSavings + Math.max(-1e12, toNum(savingsMonthlyDrift))); // guard huge negatives
    }

    const totals = schedule.reduce(
      (acc, s) => {
        acc.totalInterest += s.interestPaid;
        acc.totalPaid += s.payment;
        return acc;
      },
      { totalInterest: 0, totalPaid: 0 }
    );

    return { schedule, totals, emi: Number(emi.toFixed(2)) };
  }

  /** ---------- Scenarios (for chosen tenure) ---------- **/

  const baseScenario = useMemo(
    () =>
      buildSchedule({
        principal: loanAmount,
        months: totalMonths,
        annualRate,
        emiStartISO: emiStartDate,
      }),
    [loanAmount, totalMonths, annualRate, emiStartDate]
  );

  const prepayScenario = useMemo(
    () =>
      buildSchedule({
        principal: loanAmount,
        months: totalMonths,
        annualRate,
        emiStartISO: emiStartDate,
        oneTimePrepay: toNum(oneTimePrepayAmt || whatIfOneTime),
        oneTimePrepayDateISO: oneTimePrepayDate || null,
        recurringPrepay: toNum(recurringPrepayAmt),
        recurringFreq: recurringPrepayFreq,
      }),
    [
      loanAmount,
      totalMonths,
      annualRate,
      emiStartDate,
      oneTimePrepayAmt,
      oneTimePrepayDate,
      recurringPrepayAmt,
      recurringPrepayFreq,
      whatIfOneTime,
    ]
  );

  const savingsScenario = useMemo(
    () =>
      buildSchedule({
        principal: loanAmount,
        months: totalMonths,
        annualRate,
        emiStartISO: emiStartDate,
        savingsLink: linkSavings,
        savingsInit: toNum(whatIfSavings || savingsBalance),
        savingsMonthlyDrift: toNum(savingsGrowthMonthly),
      }),
    [
        loanAmount,
        totalMonths,
        annualRate,
        emiStartDate,
        linkSavings,
        savingsBalance,
        whatIfSavings,
        savingsGrowthMonthly,
      ]
  );

  const prepaySavingsScenario = useMemo(
    () =>
      buildSchedule({
        principal: loanAmount,
        months: totalMonths,
        annualRate,
        emiStartISO: emiStartDate,
        oneTimePrepay: toNum(oneTimePrepayAmt || whatIfOneTime),
        oneTimePrepayDateISO: oneTimePrepayDate || null,
        recurringPrepay: toNum(recurringPrepayAmt),
        recurringFreq: recurringPrepayFreq,
        savingsLink: linkSavings,
        savingsInit: toNum(whatIfSavings || savingsBalance),
        savingsMonthlyDrift: toNum(savingsGrowthMonthly),
      }),
    [
      loanAmount,
      totalMonths,
      annualRate,
      emiStartDate,
      oneTimePrepayAmt,
      whatIfOneTime,
      oneTimePrepayDate,
      recurringPrepayAmt,
      recurringPrepayFreq,
      linkSavings,
      savingsBalance,
      whatIfSavings,
      savingsGrowthMonthly,
    ]
  );

  /** ---------- Charts (for chosen tenure) ---------- **/

  const chartData = useMemo(() => {
    const maxLen = Math.max(
      baseScenario.schedule.length,
      prepayScenario.schedule.length,
      savingsScenario.schedule.length,
      prepaySavingsScenario.schedule.length
    );
    const arr = [];
    for (let i = 0; i < maxLen; i++) {
      arr.push({
        month: i + 1,
        baseBalance: baseScenario.schedule[i]?.balance ?? 0,
        prepayBalance: prepayScenario.schedule[i]?.balance ?? 0,
        savingsBalance: savingsScenario.schedule[i]?.balance ?? 0,
        prepaySavingsBalance: prepaySavingsScenario.schedule[i]?.balance ?? 0,
        baseInterestCumu: baseScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
        prepayInterestCumu: prepayScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
        savingsInterestCumu: savingsScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
        prepaySavingsInterestCumu: prepaySavingsScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
      });
    }
    return arr;
  }, [baseScenario, prepayScenario, savingsScenario, prepaySavingsScenario]);

  /** ---------- Recommendations (for chosen tenure) ---------- **/

  const recommendations = useMemo(() => {
    const baseInterest = baseScenario.totals.totalInterest;
    const baseMonths = baseScenario.schedule.length;

    const scenarios = [
      { name: "Prepay", interest: prepayScenario.totals.totalInterest, months: prepayScenario.schedule.length },
      { name: "Savings Linked", interest: savingsScenario.totals.totalInterest, months: savingsScenario.schedule.length },
      { name: "Prepay + Savings", interest: prepaySavingsScenario.totals.totalInterest, months: prepaySavingsScenario.schedule.length },
    ];

    const tableData = scenarios.map((s) => {
      const interestSaved = baseInterest - s.interest;
      const monthsSaved = baseMonths - s.months;
      const percentSaved = baseInterest > 0 ? ((interestSaved / baseInterest) * 100).toFixed(1) : "0.0";
      return { name: s.name, interestSaved, monthsSaved, percentSaved };
    });

    const insights = tableData
      .map((r) => {
        if (r.interestSaved <= 0) return null;
        let text = `${r.name}: Save ₹${formatINR(r.interestSaved)} (${r.percentSaved}% interest)`;
        if (r.monthsSaved > 0) text += `, cut tenure by ${r.monthsSaved} month${r.monthsSaved > 1 ? "s" : ""}.`;
        if (r.name.includes("Savings")) {
          const effReductionPct = ((r.interestSaved / Math.max(1, loanAmount)) * annualRate).toFixed(2);
          text += ` Effective rate reduction ~ ${effReductionPct}%.`;
        }
        if (toNum(oneTimePrepayAmt || whatIfOneTime) > 0) {
          text += ` One-time prepay of ₹${formatINR(toNum(oneTimePrepayAmt || whatIfOneTime))} helps early.`;
        }
        if (toNum(recurringPrepayAmt) > 0) {
          text += ` Recurring prepay ₹${formatINR(toNum(recurringPrepayAmt))} ${recurringPrepayFreq} trims tenure.`;
        }
        return text;
      })
      .filter(Boolean);

    const best = tableData.reduce((prev, curr) => (curr.interestSaved > (prev.interestSaved || 0) ? curr : prev), {});
    if (best.name) insights.push(`🏆 Best option: ${best.name} for maximum savings.`);
    return { tableData, insights };
  }, [
    baseScenario,
    prepayScenario,
    savingsScenario,
    prepaySavingsScenario,
    loanAmount,
    annualRate,
    oneTimePrepayAmt,
    whatIfOneTime,
    recurringPrepayAmt,
    recurringPrepayFreq,
  ]);

  const { tableData, insights } = recommendations;

  /** ---------- Tenure Comparison (NEW) ---------- **/

  // Years to compare side-by-side (kept small & explicit for clarity)
  const TENURE_SET = [18, 20, 22, 25, 30];

  /**
   * For each tenure, compute the same four scenarios using the SAME inputs
   * (rate, prepay settings, savings offset options), but with months derived
   * from the tenure in the set above. This answers: “what if I picked a different tenure?”
   */
  const tenureComparison = useMemo(() => {
    return TENURE_SET.map((years) => {
      const months = years * 12;
      const base = buildSchedule({
        principal: loanAmount,
        months,
        annualRate,
        emiStartISO: emiStartDate,
      });
      const prepay = buildSchedule({
        principal: loanAmount,
        months,
        annualRate,
        emiStartISO: emiStartDate,
        oneTimePrepay: toNum(oneTimePrepayAmt || whatIfOneTime),
        oneTimePrepayDateISO: oneTimePrepayDate || null,
        recurringPrepay: toNum(recurringPrepayAmt),
        recurringFreq: recurringPrepayFreq,
      });
      const savings = buildSchedule({
        principal: loanAmount,
        months,
        annualRate,
        emiStartISO: emiStartDate,
        savingsLink: linkSavings,
        savingsInit: toNum(whatIfSavings || savingsBalance),
        savingsMonthlyDrift: toNum(savingsGrowthMonthly),
      });
      const prepaySavings = buildSchedule({
        principal: loanAmount,
        months,
        annualRate,
        emiStartISO: emiStartDate,
        oneTimePrepay: toNum(oneTimePrepayAmt || whatIfOneTime),
        oneTimePrepayDateISO: oneTimePrepayDate || null,
        recurringPrepay: toNum(recurringPrepayAmt),
        recurringFreq: recurringPrepayFreq,
        savingsLink: linkSavings,
        savingsInit: toNum(whatIfSavings || savingsBalance),
        savingsMonthlyDrift: toNum(savingsGrowthMonthly),
      });

      return {
        tenure: `${years}y`,
        scenarios: {
          Base: base,
          Prepay: prepay,
          "Savings Linked": savings,
          "Prepay + Savings": prepaySavings,
        },
      };
    });
  }, [
    loanAmount,
    annualRate,
    emiStartDate,
    oneTimePrepayAmt,
    whatIfOneTime,
    oneTimePrepayDate,
    recurringPrepayAmt,
    recurringPrepayFreq,
    linkSavings,
    savingsBalance,
    whatIfSavings,
    savingsGrowthMonthly,
  ]);

  // Build a simple chart dataset per tenure using Base total interest (you can switch to any scenario)
  const tenureChartData = useMemo(() => {
    return tenureComparison.map((row) => {
      return {
        tenure: row.tenure,
        totalInterestBase: row.scenarios.Base.totals.totalInterest,
        details: row.scenarios,
      };
    });
  }, [tenureComparison]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const details = payload[0].payload.details;
      return (
        <div style={{ background: "#fff", border: "1px solid #ccc", padding: 10, fontSize: 12 }}>
          <div><b>Tenure: {label}</b></div>
          {Object.entries(details).map(([name, scen]) => (
            <div key={name} style={{ marginTop: 4 }}>
              <b>{name}</b>: Interest ₹{formatINR(scen.totals.totalInterest)}, EMI ₹{formatINR(scen.emi)}, Payoff {scen.schedule.length}m
            </div>
          ))}
        </div>
      );
    }
    return null;
  };


  /** ---------- CSV Export ---------- **/
  function exportCSV(schedule, filename = "amortization.csv") {
    const header = ["Month", "Date", "Payment", "PrincipalPaid", "InterestPaid", "Balance", "SavingsLinked"];
    const rows = schedule.map((r) => [r.month, r.date, r.payment, r.principalPaid, r.interestPaid, r.balance, r.savingsLinked]);
    const csvContent = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const currentSchedule = useMemo(() => {
    switch (selectedScenario) {
      case "prepay":
        return prepayScenario.schedule;
      case "savings":
        return savingsScenario.schedule;
      case "prepaySavings":
        return prepaySavingsScenario.schedule;
      case "base":
      default:
        return baseScenario.schedule;
    }
  }, [selectedScenario, baseScenario, prepayScenario, savingsScenario, prepaySavingsScenario]);

  /** ---------- Styles ---------- **/
  const styles = `
  :root{
    --bg:#f6f8fb;
    --card:#ffffff;
    --muted:#6b7280;
    --accent:#0ea5e9;
    --accent-2:#10b981;
    --danger:#ef4444;
    --radius:14px;
    --shadow: 0 6px 18px rgba(18,38,63,0.06);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  }
  .hla-container{padding:20px;max-width:1200px;margin:0 auto;background:var(--bg)}
  .hla-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  @media(max-width:1000px){.hla-grid{grid-template-columns:1fr}}
  .hla-card{background:var(--card);padding:18px;border-radius:var(--radius);box-shadow:var(--shadow);}
  .hla-title{font-size:22px;font-weight:700;margin-bottom:12px}
  label{display:block;font-size:13px;color:var(--muted);margin-top:8px}
  input[type="number"],input[type="date"],select{width:100%;padding:10px;border-radius:8px;border:1px solid #e6eef6;background:#fff;font-size:14px}
  .small{font-size:13px;color:var(--muted)}
  .summary-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px}
  .summary-card{background:#f8fafc;padding:12px;border-radius:10px}
  .big-num{font-size:18px;font-weight:700}
  .btn{display:inline-block;padding:8px 12px;border-radius:10px;background:var(--accent);color:white;border:none;cursor:pointer}
  .btn.green{background:var(--accent-2)}
  .charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}
  @media(max-width:1100px){.charts-grid{grid-template-columns:1fr}}
  .table-wrapper{overflow:auto;max-height:420px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:8px;border-bottom:1px solid #eef4fb;text-align:left}
  th{position:sticky;top:0;background:#fff}
  ul.recs{margin:0;padding-left:18px}
  .note{font-size:12px;color:var(--muted);margin-top:10px}

  .tenure-grid{display:grid;grid-template-columns:repeat(1,1fr);gap:10px}
  @media(max-width:1100px){.tenure-grid{grid-template-columns:repeat(2,1fr)}}
  .tenure-card{background:#f8fafc;border:1px solid #eef4fb;border-radius:12px;padding:12px}
  .tenure-title{font-weight:600;margin-bottom:6px}
  `;

  /** ---------- Render ---------- **/
  return (
    <div className="hla-container">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <h1 className="hla-title">Home Loan Analyzer</h1>

      {/* Inputs */}
      <div className="hla-grid">
        {/* Loan Inputs */}
        <div className="hla-card">
          <h2 className="small">Loan Inputs</h2>

          <label>Loan Amount (₹)</label>
          <input
            type="number"
            inputMode="numeric"
            value={loanAmount}
            onChange={(e) => setLoanAmount(Math.max(0, toNum(e.target.value)))}
          />

          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <label>Tenure (yrs)</label>
              <input
                type="number"
                inputMode="numeric"
                value={tenureYears}
                onChange={(e) => setTenureYears(Math.max(0, toNum(e.target.value)))}
              />
            </div>
            <div style={{ width: 120 }}>
              <label>+ months</label>
              <input
                type="number"
                inputMode="numeric"
                value={tenureMonths}
                onChange={(e) => setTenureMonths(Math.max(0, toNum(e.target.value)))}
              />
            </div>
          </div>

          <label>Annual Interest Rate (%)</label>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={annualRate}
            onChange={(e) => setAnnualRate(Math.max(0, toNum(e.target.value)))}
          />

          <label>EMI Start Date</label>
          <input type="date" value={emiStartDate} onChange={(e) => setEmiStartDate(e.target.value)} />

          <hr style={{ margin: "14px 0" }} />

          <h3 className="small">Prepayment Options</h3>
          <label>One-time Prepayment (₹)</label>
          <input
            type="number"
            inputMode="numeric"
            value={oneTimePrepayAmt}
            onChange={(e) => setOneTimePrepayAmt(Math.max(0, toNum(e.target.value)))}
          />
          <label>Date for one-time prepayment</label>
          <input type="date" value={oneTimePrepayDate} onChange={(e) => setOneTimePrepayDate(e.target.value)} />

          <label>Recurring prepayment (₹)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              inputMode="numeric"
              value={recurringPrepayAmt}
              onChange={(e) => setRecurringPrepayAmt(Math.max(0, toNum(e.target.value)))}
            />
            <select value={recurringPrepayFreq} onChange={(e) => setRecurringPrepayFreq(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        </div>

        {/* Savings card */}
        <div className="hla-card">
          <h2 className="small">Max Savings Plan</h2>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={linkSavings} onChange={(e) => setLinkSavings(e.target.checked)} /> Opt In
          </label>

          <label>Current savings balance (₹)</label>
          <input
            type="number"
            inputMode="numeric"
            value={savingsBalance}
            onChange={(e) => setSavingsBalance(Math.max(0, toNum(e.target.value)))}
          />

          <label>Monthly growth/decline in savings (₹)</label>
          <input
            type="number"
            inputMode="numeric"
            value={savingsGrowthMonthly}
            onChange={(e) => setSavingsGrowthMonthly(toNum(e.target.value))}
          />
        </div>

        {/* Summary cards */}
        <div className="hla-card">
          <h2 className="small">Summary (Current Tenure)</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="small">EMI (Base)</div>
              <div className="big-num">₹{formatINR(baseScenario.emi)}</div>
            </div>
            <div className="summary-card">
              <div className="small">Total Interest (Base)</div>
              <div className="big-num">₹{formatINR(baseScenario.totals.totalInterest)}</div>
            </div>
            <div className="summary-card">
              <div className="small">Payoff after (months)</div>
              <div className="big-num">{baseScenario.schedule.length}</div>
            </div>
            <div className="summary-card">
              <div className="small">Total Cost (P + I)</div>
              <div className="big-num">₹{formatINR(loanAmount + baseScenario.totals.totalInterest)}</div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => exportCSV(baseScenario.schedule, "base_amortization.csv")}>
              Export Base CSV
            </button>
            <button
              className="btn green"
              style={{ marginLeft: 8 }}
              onClick={() => exportCSV(prepayScenario.schedule, "prepay_amortization.csv")}
            >
              Export Prepay CSV
            </button>
          </div>
        </div>
      </div>

      {/* Charts for selected tenure */}
      <div className="charts-grid">
        <div className="hla-card">
          <h3 className="small">Remaining Balance — Scenario Comparison</h3>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="baseBalance" name="Base" stroke="#8884d8" dot={false} />
                <Line type="monotone" dataKey="prepayBalance" name="Prepay" stroke="#82ca9d" dot={false} />
                <Line type="monotone" dataKey="savingsBalance" name="Savings Linked" stroke="#ff7300" dot={false} />
                <Line type="monotone" dataKey="prepaySavingsBalance" name="Prepay + Savings" stroke="#d62728" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="hla-card">
          <h3 className="small">Cumulative Interest — Scenario Comparison</h3>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="baseInterestCumu" name="Base" stroke="#8884d8" dot={false} />
                <Line type="monotone" dataKey="prepayInterestCumu" name="Prepay" stroke="#82ca9d" dot={false} />
                <Line type="monotone" dataKey="savingsInterestCumu" name="Savings Linked" stroke="#ff7300" dot={false} />
                <Line type="monotone" dataKey="prepaySavingsInterestCumu" name="Prepay + Savings" stroke="#d62728" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Amortization Schedule */}
        <div className="hla-card" style={{ gridColumn: "1 / -1" }}>
          <h3 className="small">Amortization Schedule</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <label>
              <input
                type="radio"
                name="scenario"
                value="base"
                checked={selectedScenario === "base"}
                onChange={(e) => setSelectedScenario(e.target.value)}
              />{" "}
              Base
            </label>
            <label>
              <input
                type="radio"
                name="scenario"
                value="prepay"
                checked={selectedScenario === "prepay"}
                onChange={(e) => setSelectedScenario(e.target.value)}
              />{" "}
              Prepay
            </label>
            <label>
              <input
                type="radio"
                name="scenario"
                value="savings"
                checked={selectedScenario === "savings"}
                onChange={(e) => setSelectedScenario(e.target.value)}
              />{" "}
              Savings Linked
            </label>
            <label>
              <input
                type="radio"
                name="scenario"
                value="prepaySavings"
                checked={selectedScenario === "prepaySavings"}
                onChange={(e) => setSelectedScenario(e.target.value)}
              />{" "}
              Prepay + Savings
            </label>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Date</th>
                  <th>Payment</th>
                  <th>Principal</th>
                  <th>Interest</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {currentSchedule.slice(0, 500).map((r) => (
                  <tr key={r.month}>
                    <td>{r.month}</td>
                    <td>{r.date}</td>
                    <td>₹{formatINR(r.payment)}</td>
                    <td>₹{formatINR(r.principalPaid)}</td>
                    <td>₹{formatINR(r.interestPaid)}</td>
                    <td>₹{formatINR(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scenario Comparison (Current Tenure) */}
        <div className="hla-card" style={{ gridColumn: "1 / -1" }}>
          <h3 className="small">Scenario Comparison (Current Tenure)</h3>
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th>EMI</th>
                <th>Payoff Months</th>
                <th>Total Interest</th>
                <th>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Base</td>
                <td>₹{formatINR(baseScenario.emi)}</td>
                <td>{baseScenario.schedule.length}</td>
                <td>₹{formatINR(baseScenario.totals.totalInterest)}</td>
                <td>₹{formatINR(loanAmount + baseScenario.totals.totalInterest)}</td>
              </tr>
              <tr>
                <td>Prepay</td>
                <td>₹{formatINR(prepayScenario.emi)}</td>
                <td>{prepayScenario.schedule.length}</td>
                <td>₹{formatINR(prepayScenario.totals.totalInterest)}</td>
                <td>₹{formatINR(loanAmount + prepayScenario.totals.totalInterest)}</td>
              </tr>
              <tr>
                <td>Savings Linked</td>
                <td>₹{formatINR(savingsScenario.emi)}</td>
                <td>{savingsScenario.schedule.length}</td>
                <td>₹{formatINR(savingsScenario.totals.totalInterest)}</td>
                <td>₹{formatINR(loanAmount + savingsScenario.totals.totalInterest)}</td>
              </tr>
              <tr>
                <td>Prepay + Savings</td>
                <td>₹{formatINR(prepaySavingsScenario.emi)}</td>
                <td>{prepaySavingsScenario.schedule.length}</td>
                <td>₹{formatINR(prepaySavingsScenario.totals.totalInterest)}</td>
                <td>₹{formatINR(loanAmount + prepaySavingsScenario.totals.totalInterest)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Auto Recommendations */}
        <div className="hla-card" style={{ gridColumn: "1 / -1" }}>
          <h3 className="small">Auto Recommendations</h3>

          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Interest Saved</th>
                <th>% Saved</th>
                <th>Tenure Reduced</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((r, i) => (
                <tr key={i} style={{ fontWeight: r.interestSaved > 0 ? "600" : "normal" }}>
                  <td>{r.name}</td>
                  <td>{r.interestSaved > 0 ? `₹${formatINR(r.interestSaved)}` : "-"}</td>
                  <td>{r.interestSaved > 0 ? `${r.percentSaved}%` : "-"}</td>
                  <td>{r.monthsSaved > 0 ? `${r.monthsSaved} month${r.monthsSaved > 1 ? "s" : ""}` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="recs" style={{ marginTop: 12 }}>
            {insights.map((ins, i) => (
              <li key={i}>{ins}</li>
            ))}
          </ul>
        </div>

        {/* ---------- NEW: Tenure Comparison Section ---------- */}
        <div className="hla-card" style={{ gridColumn: "1 / -1" }}>
        <h3 className="small">Tenure Comparison — Tooltip shows all scenarios</h3>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={tenureChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tenure" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="totalInterestBase" name="Total Interest (Base)" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      </div>

      <div className="note">
        Note: This calculator models a savings “offset” by reducing the interest-bearing principal by the savings
        balance each month. Bank-specific sweep/offset behaviour (daily averaging, min balances, taxes) may differ.
      </div>
    </div>
  );
}
