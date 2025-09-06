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
} from "recharts";

// helper for lakh/crore format with 2 decimals
function formatINR(num) {
  if (num == null || isNaN(num)) return "0.00";
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function HomeLoanAnalyzer() {
  const [loanAmount, setLoanAmount] = useState(7500000);
  const [tenureYears, setTenureYears] = useState(25);
  const [tenureMonths, setTenureMonths] = useState(0);
  const [annualRate, setAnnualRate] = useState(7.7);
  const [emiStartDate, setEmiStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  const [oneTimePrepayAmt, setOneTimePrepayAmt] = useState("");
  const [oneTimePrepayDate, setOneTimePrepayDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [recurringPrepayAmt, setRecurringPrepayAmt] = useState("100000");
  const [recurringPrepayFreq, setRecurringPrepayFreq] = useState("yearly");

  const [linkSavings, setLinkSavings] = useState(true);
  const [savingsBalance, setSavingsBalance] = useState(100000);
  const [savingsGrowthMonthly, setSavingsGrowthMonthly] = useState(10000);

  const [whatIfSavings, setWhatIfSavings] = useState(100000);
  const [whatIfOneTime, setWhatIfOneTime] = useState("");

  const [selectedScenario, setSelectedScenario] = useState("base"); // default view
  const totalMonths = useMemo(() => tenureYears * 12 + Number(tenureMonths), [tenureYears, tenureMonths]);

  function monthlyEMI(P, rAnnual, nMonths) {
    const r = rAnnual / 12 / 100;
    if (r === 0) return P / nMonths;
    return (P * r * Math.pow(1 + r, nMonths)) / (Math.pow(1 + r, nMonths) - 1);
  }

   // Generate amortization schedule considering: prepayments (one-time, recurring), savings offset (simple "offset balance reduces principal for interest calc")
  function buildSchedule({
    principal,
    months,
    annualRate,
    emiStartISO,
    oneTimePrepay = 0,
    oneTimePrepayDateISO = null,
    recurringPrepay = 0,
    recurringFreq = "yearly",
    recurringStart = 2,
    savingsLink = false,
    savingsInit = 0,
    savingsMonthlyDrift = 0,
  }) {
    const schedule = [];
    let outstanding = principal;
    const monthlyRate = annualRate / 12 / 100;
    const emi = monthlyEMI(principal, annualRate, months);
    const startDate = new Date(emiStartISO);
    const recurringInterval = recurringFreq === "monthly" ? 1 : recurringFreq === "quarterly" ? 3 : 12;
    let currSavings = savingsInit;

    for (let m = 1; m <= months; m++) {
      if (outstanding <= 0.0001) break;

      const monthIndex = schedule.length + 1;
      const date = new Date(startDate);
      date.setMonth(startDate.getMonth() + schedule.length);

      // 1) Apply one-time prepayment if scheduled for this month
      if (oneTimePrepayDateISO) {
        const otp = new Date(oneTimePrepayDateISO);
        if (otp.getFullYear() === date.getFullYear() && otp.getMonth() === date.getMonth()) {
          outstanding = Math.max(0, outstanding - oneTimePrepay);
        }
      }

      // 2) Apply recurring prepayment (if month matches frequency and start)
      if (recurringPrepay > 0 && monthIndex >= recurringStart && (monthIndex - recurringStart) % recurringInterval === 0) {
        outstanding = Math.max(0, outstanding - recurringPrepay);
      }

      // 3) Effective principal for interest calculation
      const effectivePrincipal = savingsLink ? Math.max(0, outstanding - currSavings) : outstanding;

      // 4) Interest payment for this month
      const interestPayment = effectivePrincipal * monthlyRate;

      // 5) Principal portion of EMI (capped to outstanding)
      let principalPayment = emi - interestPayment;
      if (principalPayment > outstanding) principalPayment = outstanding;
      if (principalPayment < 0) principalPayment = 0;

      // 6) Total payment & update outstanding
      const payment = principalPayment + interestPayment;
      outstanding = Math.max(0, outstanding - principalPayment);

      // 7) Save the current month schedule, including current savings
      schedule.push({
        month: monthIndex,
        date: date.toISOString().slice(0, 10),
        payment: Number(payment.toFixed(2)),
        principalPaid: Number(principalPayment.toFixed(2)),
        interestPaid: Number(interestPayment.toFixed(2)),
        balance: Number(outstanding.toFixed(2)),
        savingsLinked: Number(currSavings.toFixed(2)),
      });

      // 8) Update savings for next month
      currSavings = Math.max(0, currSavings + Number(savingsMonthlyDrift));
    }

    // Totals
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


  const baseScenario = useMemo(() => {
    return buildSchedule({
      principal: loanAmount,
      months: totalMonths,
      annualRate,
      emiStartISO: emiStartDate,
    });
  }, [loanAmount, totalMonths, annualRate, emiStartDate]);

  const prepayScenario = useMemo(() => {
    return buildSchedule({
      principal: loanAmount,
      months: totalMonths,
      annualRate,
      emiStartISO: emiStartDate,
      oneTimePrepay: oneTimePrepayAmt || whatIfOneTime,
      oneTimePrepayDateISO: oneTimePrepayDate || null,
      recurringPrepay: recurringPrepayAmt,
      recurringFreq: recurringPrepayFreq,
    });
  }, [
    loanAmount,
    totalMonths,
    annualRate,
    emiStartDate,
    oneTimePrepayAmt,
    oneTimePrepayDate,
    recurringPrepayAmt,
    recurringPrepayFreq,
    whatIfOneTime,
  ]);

  const savingsScenario = useMemo(() => {
    return buildSchedule({
      principal: loanAmount,
      months: totalMonths,
      annualRate,
      emiStartISO: emiStartDate,
      savingsLink: linkSavings,
      savingsInit: whatIfSavings || savingsBalance,
      savingsMonthlyDrift: savingsGrowthMonthly,
    });
  }, [
    loanAmount,
    totalMonths,
    annualRate,
    emiStartDate,
    linkSavings,
    savingsBalance,
    whatIfSavings,
    savingsGrowthMonthly,
  ]);

  const prepaySavingsScenario = useMemo(() => {
    return buildSchedule({
      principal: loanAmount,
      months: totalMonths,
      annualRate,
      emiStartISO: emiStartDate,
      oneTimePrepay: oneTimePrepayAmt || whatIfOneTime,
      oneTimePrepayDateISO: oneTimePrepayDate || null,
      recurringPrepay: recurringPrepayAmt,
      recurringFreq: recurringPrepayFreq,
      savingsLink: linkSavings,
      savingsInit: whatIfSavings || savingsBalance,
      savingsMonthlyDrift: savingsGrowthMonthly,
    });
  }, [
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
  ]);

  const chartData = useMemo(() => {
    const maxLen = Math.max(baseScenario.schedule.length, prepayScenario.schedule.length, savingsScenario.schedule.length, prepaySavingsScenario.schedule.length);
    const arr = [];
    for (let i = 0; i < maxLen; i++) {
      arr.push({
        month: i + 1,
        baseBalance: baseScenario.schedule[i] ? baseScenario.schedule[i].balance : 0,
        prepayBalance: prepayScenario.schedule[i] ? prepayScenario.schedule[i].balance : 0,
        savingsBalance: savingsScenario.schedule[i] ? savingsScenario.schedule[i].balance : 0,
        prepaySavingsBalance: prepaySavingsScenario.schedule[i] ? prepaySavingsScenario.schedule[i].balance : 0,
        baseInterestCumu: baseScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
        prepayInterestCumu: prepayScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
        savingsInterestCumu: savingsScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
        prepaySavingsInterestCumu: prepaySavingsScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
      });
    }
    return arr;
  }, [baseScenario, prepayScenario, savingsScenario, prepaySavingsScenario]);

  function generateRecommendations() {
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
      const percentSaved = ((interestSaved / baseInterest) * 100).toFixed(1);

      return {
        name: s.name,
        interestSaved,
        monthsSaved,
        percentSaved,
      };
    });

    // Generate text insights
    const insights = tableData.map((r) => {
      if (r.interestSaved <= 0) return null;
      let text = `${r.name}: Save ₹${formatINR(r.interestSaved)} (${r.percentSaved}% of interest)`;
      if (r.monthsSaved > 0) text += `, reduce tenure by ${r.monthsSaved} month${r.monthsSaved > 1 ? "s" : ""}.`;

      // Additional suggestions
      if (r.name.includes("Savings")) {
        text += ` Effective interest rate reduction ≈ ${(annualRate - ((r.interestSaved / loanAmount) * annualRate)).toFixed(2)}%.`;
      }
      if (oneTimePrepayAmt || whatIfOneTime) {
        text += ` One-time prepayment of ₹${formatINR(oneTimePrepayAmt || whatIfOneTime)} saves interest early in loan term.`;
      }
      if (recurringPrepayAmt) {
        text += ` Recurring prepayment of ₹${formatINR(recurringPrepayAmt)} ${recurringPrepayFreq} reduces tenure.`;
      }

      return text;
    }).filter(Boolean);

    // Identify best scenario (max interest saved)
    const best = tableData.reduce((prev, curr) => (curr.interestSaved > (prev.interestSaved || 0) ? curr : prev), {});
    if (best.name) insights.push(`🏆 Best option: ${best.name} for maximum savings!`);

    return { tableData, insights };
  }



  const recommendations = useMemo(generateRecommendations, [baseScenario, prepayScenario, savingsScenario, prepaySavingsScenario, linkSavings, savingsBalance, whatIfSavings, oneTimePrepayAmt, whatIfOneTime, recurringPrepayAmt]);

  const { tableData, insights } = recommendations;
  // Export CSV helper
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


  // Minimal CSS included as a string so the single-file component has styling without Tailwind dependency
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
  .hla-container{padding:20px;max-width:1150px;margin:0 auto;background:var(--bg)}
  .hla-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  @media(max-width:900px){.hla-grid{grid-template-columns:1fr}}
  .hla-card{background:var(--card);padding:18px;border-radius:var(--radius);box-shadow:var(--shadow);}
  .hla-title{font-size:20px;font-weight:600;margin-bottom:8px}
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

  /* slider style */
  input[type=range]{width:100%}
  `;


  return (
    <div className="hla-container">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <h1 className="hla-title">Home Loan Analyzer</h1>

      {/* Inputs Card */}
      <div className="hla-grid">
        <div className="hla-card">
          <h2 className="small">Loan Inputs</h2>
          <label>Loan Amount (₹)</label>
          <input type="number" value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} />

          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <label>Tenure (yrs)</label>
              <input type="number" value={tenureYears} onChange={(e) => setTenureYears(Number(e.target.value))} />
            </div>
            <div style={{ width: 120 }}>
              <label>+ months</label>
              <input type="number" value={tenureMonths} onChange={(e) => setTenureMonths(Number(e.target.value))} />
            </div>
          </div>

          <label>Annual Interest Rate (%)</label>
          <input type="number" step="0.01" value={annualRate} onChange={(e) => setAnnualRate(Number(e.target.value))} />

          <label>EMI Start Date</label>
          <input type="date" value={emiStartDate} onChange={(e) => setEmiStartDate(e.target.value)} />

          <hr style={{ margin: "14px 0" }} />

          <h3 className="small">Prepayment Options</h3>
          <label>One-time Prepayment (₹)</label>
          <input type="number" value={oneTimePrepayAmt} onChange={(e) => setOneTimePrepayAmt(Number(e.target.value))} />
          <label>Date for one-time prepayment</label>
          <input type="date" value={oneTimePrepayDate} onChange={(e) => setOneTimePrepayDate(e.target.value)} />

          <label>Recurring prepayment (₹)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" value={recurringPrepayAmt} onChange={(e) => setRecurringPrepayAmt(Number(e.target.value))} />
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
          <input type="number" value={savingsBalance} onChange={(e) => setSavingsBalance(Number(e.target.value))} />

          <label>Monthly growth/decline in savings (₹)</label>
          <input type="number" value={savingsGrowthMonthly} onChange={(e) => setSavingsGrowthMonthly(Number(e.target.value))} />

          <hr style={{ margin: "14px 0" }} />

          <h3 className="small">What-if quick sliders</h3>
          <label className="small">Test savings to link: ₹{formatINR(whatIfSavings)}</label>
          <input type="number" value={whatIfSavings} onChange={(e) => setWhatIfSavings(Number(e.target.value))} />

          <label className="small">Test one-time prepayment: ₹{formatINR(whatIfOneTime)}</label>
          <input type="number" value={whatIfOneTime} onChange={(e) => setWhatIfOneTime(Number(e.target.value))} />
        </div>

        {/* Summary cards */}
        <div className="hla-card">
          <h2 className="small">Summary</h2>
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
              <div className="small">Total Cost (Principal + Interest)</div>
              <div className="big-num">₹{formatINR(loanAmount + baseScenario.totals.totalInterest)}</div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => exportCSV(baseScenario.schedule, "base_amortization.csv")}>Export Base CSV</button>
            <button className="btn green" style={{ marginLeft: 8 }} onClick={() => exportCSV(prepayScenario.schedule, "prepay_amortization.csv")}>Export Prepay CSV</button>
          </div>
        </div>
      </div>

      {/* Charts and schedule tabs */}
      <div className="charts-grid">
        <div className="hla-card">
          <h3 className="small">Remaining Balance Comparison</h3>
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
          <h3 className="small">Cumulative Interest Comparison</h3>
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

  
      <div className="hla-card" style={{ gridColumn: "1 / -1" }}>
        <h3 className="small">Amortization Schedule (Base)</h3>
        <div style={{ display: 'flex'}}>
          <label>
            <input type="radio" name="scenario" value="base"
              checked={selectedScenario === "base"}
              onChange={(e) => setSelectedScenario(e.target.value)} /> Base
          </label>
          <label style={{ marginLeft: 12 }}>
            <input type="radio" name="scenario" value="prepay"
              checked={selectedScenario === "prepay"}
              onChange={(e) => setSelectedScenario(e.target.value)} /> Prepay
          </label>
          <label style={{ marginLeft: 12 }}>
            <input type="radio" name="scenario" value="savings"
              checked={selectedScenario === "savings"}
              onChange={(e) => setSelectedScenario(e.target.value)} /> Savings Linked
          </label>
          <label style={{ marginLeft: 12 }}>
            <input type="radio" name="scenario" value="prepaySavings"
              checked={selectedScenario === "prepaySavings"}
              onChange={(e) => setSelectedScenario(e.target.value)} /> Prepay + Savings
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

      {/* Scenario Comparison */}
      <div className="hla-card" style={{ gridColumn: "1 / -1" }}>
        <h3 className="small">Scenario Comparison (Quick)</h3>
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
      <div className="hla-card" style={{ gridColumn: "1 / -1" }}>
        <h3 className="small">Auto Recommendations</h3>

        {/* Table */}
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

        {/* Text Insights */}
        <ul className="recs" style={{ marginTop: 12 }}>
          {insights.map((ins, i) => (
            <li key={i}>{ins}</li>
          ))}
        </ul>
      </div>
      </div>

      <div className="note">Note: This calculator models a savings "offset" simply by reducing the interest-bearing principal by the savings balance each month. For bank-specific sweep/offset behaviour (e.g. daily averaging, min-balance rules, tax/legal considerations), consult your lender.</div>
    </div>
  );
}