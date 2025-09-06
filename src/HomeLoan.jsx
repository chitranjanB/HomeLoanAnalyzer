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

  const totalMonths = useMemo(() => tenureYears * 12 + Number(tenureMonths), [tenureYears, tenureMonths]);

  function monthlyEMI(P, rAnnual, nMonths) {
    const r = rAnnual / 12 / 100;
    if (r === 0) return P / nMonths;
    return (P * r * Math.pow(1 + r, nMonths)) / (Math.pow(1 + r, nMonths) - 1);
  }

   // Generate amortization schedule considering: prepayments (one-time, recurring), savings offset (simple "offset balance reduces principal for interest calc")
  function buildSchedule({ principal, months, annualRate, emiStartISO, oneTimePrepay = 0, oneTimePrepayDateISO = null, recurringPrepay = 0, recurringFreq = "yearly", savingsLink = false, savingsInit = 0, savingsMonthlyDrift = 0 }) {
    const schedule = [];
    let outstanding = principal;
    const monthlyRate = annualRate / 12 / 100;
    const emi = monthlyEMI(principal, annualRate, months);

    // Convert start date
    const startDate = new Date(emiStartISO);
    const recurringInterval = recurringFreq === "monthly" ? 1 : recurringFreq === "quarterly" ? 3 : 12;

    // For savings offset: we'll assume the savings balance reduces the interest-bearing principal each month by being "linked".
    // Effective principal for interest calculation = max(0, outstanding - savingsBalance)
    let currSavings = savingsInit;

    for (let m = 1; m <= 1000; m++) {
      // break if fully paid
      if (outstanding <= 0.0001) break;
      if (m > 10000) break;

      const monthIndex = schedule.length + 1;
      const date = new Date(startDate);
      date.setMonth(startDate.getMonth() + schedule.length);

      // Apply one-time prepay if date matches month
      if (oneTimePrepayDateISO) {
        const otp = new Date(oneTimePrepayDateISO);
        if (otp.getFullYear() === date.getFullYear() && otp.getMonth() === date.getMonth()) {
          outstanding = Math.max(0, outstanding - oneTimePrepay);
        }
      }

      // Recurring prepay if month matches frequency
      if (recurringPrepay > 0 && ((monthIndex - 1) % recurringInterval === 0)) {
        outstanding = Math.max(0, outstanding - recurringPrepay);
      }

      // Calculate effective principal after savings offset
      let effectivePrincipal = outstanding;
      if (savingsLink) {
        effectivePrincipal = Math.max(0, outstanding - currSavings);
      }

      // Interest this month based on effective principal
      const interestPayment = effectivePrincipal * monthlyRate;

      // Principal portion = EMI - interest; but if EMI > outstanding+interest -> last payment
      let principalPayment = emi - interestPayment;
      if (principalPayment > outstanding) {
        principalPayment = outstanding;
      }

      // If EMI would be less than interest (rare for negative amortization), cap
      if (principalPayment < 0) principalPayment = 0;

      const payment = principalPayment + interestPayment;
      outstanding = Math.max(0, outstanding - principalPayment);

      // After payment, savings may grow/shrink
      currSavings = Math.max(0, currSavings + Number(savingsMonthlyDrift));

      schedule.push({
        month: schedule.length + 1,
        date: date.toISOString().slice(0, 10),
        payment: Number(payment.toFixed(2)),
        principalPaid: Number(principalPayment.toFixed(2)),
        interestPaid: Number(interestPayment.toFixed(2)),
        balance: Number(outstanding.toFixed(2)),
        savingsLinked: Number(currSavings.toFixed(2)),
      });

      // safety stop at requested months if no savings/early prepayment
      if (schedule.length >= months && outstanding <= 0.0001) break;
      // if scheduled months reached and outstanding > 0, continue until paid (support negative amortization unlikely)

      if (schedule.length > Math.max(6000, months * 2)) break;
    }

    // totals
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
    const prepayInterest = prepayScenario.totals.totalInterest;
    const savingsInterest = savingsScenario.totals.totalInterest;
    const prepaySavingsInterest = prepaySavingsScenario.totals.totalInterest;

    const recs = [];
    if (linkSavings) {
      const saved = Math.max(0, baseInterest - savingsInterest);
      const monthsSaved = baseScenario.schedule.length - savingsScenario.schedule.length;
      recs.push(`Linking savings saves approx ₹${saved.toFixed(0)} and may shorten tenure by ${monthsSaved} months.`);
    }
    if ((oneTimePrepayAmt || whatIfOneTime) > 0) {
      const saved = baseInterest - prepayScenario.totals.totalInterest;
      recs.push(`One-time prepayment saves approx ₹${saved.toFixed(0)}.`);
    }
    if (recurringPrepayAmt > 0) {
      const saved = baseInterest - prepayScenario.totals.totalInterest;
      recs.push(`Recurring prepayment saves approx ₹${saved.toFixed(0)}.`);
    }
    if (linkSavings && (oneTimePrepayAmt || whatIfOneTime || recurringPrepayAmt > 0)) {
      const saved = baseInterest - prepaySavingsInterest;
      recs.push(`Combining prepayment and savings saves approx ₹${saved.toFixed(0)}.`);
    }
    return recs;
  }

  const recommendations = useMemo(generateRecommendations, [baseScenario, prepayScenario, savingsScenario, prepaySavingsScenario, linkSavings, savingsBalance, whatIfSavings, oneTimePrepayAmt, whatIfOneTime, recurringPrepayAmt]);

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
  .hla-container{padding:16px;margin:0 auto;background:var(--bg)}

  /* mobile first → single column */
  .hla-grid{display:grid;grid-template-columns:1fr;gap:16px}

  /* larger screens get 2 or 3 columns */
  @media(min-width:768px){.hla-grid{grid-template-columns:repeat(2,1fr)}}
  @media(min-width:1100px){.hla-grid{grid-template-columns:repeat(3,1fr)}}

  .hla-card{background:var(--card);padding:16px;border-radius:var(--radius);box-shadow:var(--shadow);}
  .hla-title{font-size:22px;font-weight:700;margin-bottom:12px;text-align:center}
  label{display:block;font-size:14px;color:var(--muted);margin-top:8px}
  input,select{width:90%;padding:12px;border-radius:10px;border:1px solid #e6eef6;background:#fff;font-size:15px}
  .small{font-size:13px;color:var(--muted)}
  .summary-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px}
  @media(min-width:600px){.summary-grid{grid-template-columns:repeat(2,1fr)}}
  .summary-card{background:#f8fafc;padding:14px;border-radius:12px;text-align:center}
  .big-num{font-size:18px;font-weight:700}
  .btn{display:inline-block;padding:10px 14px;border-radius:10px;background:var(--accent);color:white;border:none;cursor:pointer;margin-top:8px;font-size:14px}
  .btn.green{background:var(--accent-2)}

  .charts-grid{display:grid;grid-template-columns:1fr;gap:16px;margin-top:18px}
  @media(min-width:900px){.charts-grid{grid-template-columns:1fr 1fr}}

  .table-wrapper{overflow-x:auto;max-height:400px}
  table{width:100%;border-collapse:collapse;font-size:13px;min-width:600px}
  th,td{padding:8px;border-bottom:1px solid #eef4fb;text-align:left}
  th{position:sticky;top:0;background:#fff;font-size:12px}
  ul.recs{margin:0;padding-left:18px}
  .note{font-size:12px;color:var(--muted);margin-top:10px;text-align:center}
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
          <label className="small">Test savings to link: ₹{whatIfSavings.toLocaleString()}</label>
          <input type="number" value={whatIfSavings} onChange={(e) => setWhatIfSavings(Number(e.target.value))} />

          <label className="small">Test one-time prepayment: ₹{whatIfOneTime.toLocaleString()}</label>
          <input type="number" value={whatIfOneTime} onChange={(e) => setWhatIfOneTime(Number(e.target.value))} />
        </div>

        {/* Summary cards */}
        <div className="hla-card">
          <h2 className="small">Summary</h2>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="small">EMI (Base)</div>
              <div className="big-num">₹{baseScenario.emi.toLocaleString()}</div>
            </div>
            <div className="summary-card">
              <div className="small">Total Interest (Base)</div>
              <div className="big-num">₹{baseScenario.totals.totalInterest.toFixed(0).toLocaleString()}</div>
            </div>
            <div className="summary-card">
              <div className="small">Payoff after (months)</div>
              <div className="big-num">{baseScenario.schedule.length}</div>
            </div>
            <div className="summary-card">
              <div className="small">Total Cost (Principal + Interest)</div>
              <div className="big-num">₹{(loanAmount + baseScenario.totals.totalInterest).toFixed(0).toLocaleString()}</div>
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
                  <th>Savings Linked</th>
                </tr>
              </thead>
              <tbody>
                {baseScenario.schedule.slice(0, 500).map((r) => (
                  <tr key={r.month}>
                    <td>{r.month}</td>
                    <td>{r.date}</td>
                    <td>₹{r.payment.toLocaleString()}</td>
                    <td>₹{r.principalPaid.toLocaleString()}</td>
                    <td>₹{r.interestPaid.toLocaleString()}</td>
                    <td>₹{r.balance.toLocaleString()}</td>
                    <td>₹{r.savingsLinked.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

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
              <td>₹{baseScenario.emi.toLocaleString()}</td>
              <td>{baseScenario.schedule.length}</td>
              <td>₹{baseScenario.totals.totalInterest.toFixed(0).toLocaleString()}</td>
              <td>₹{(loanAmount + baseScenario.totals.totalInterest).toFixed(0).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Prepay</td>
              <td>₹{prepayScenario.emi.toLocaleString()}</td>
              <td>{prepayScenario.schedule.length}</td>
              <td>₹{prepayScenario.totals.totalInterest.toFixed(0).toLocaleString()}</td>
              <td>₹{(loanAmount + prepayScenario.totals.totalInterest).toFixed(0).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Savings Linked</td>
              <td>₹{savingsScenario.emi.toLocaleString()}</td>
              <td>{savingsScenario.schedule.length}</td>
              <td>₹{savingsScenario.totals.totalInterest.toFixed(0).toLocaleString()}</td>
              <td>₹{(loanAmount + savingsScenario.totals.totalInterest).toFixed(0).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Prepay + Savings</td>
              <td>₹{prepaySavingsScenario.emi.toLocaleString()}</td>
              <td>{prepaySavingsScenario.schedule.length}</td>
              <td>₹{prepaySavingsScenario.totals.totalInterest.toFixed(0).toLocaleString()}</td>
              <td>₹{(loanAmount + prepaySavingsScenario.totals.totalInterest).toFixed(0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="hla-card" style={{ gridColumn: "1 / -1" }}>
        <h3 className="small">Auto Recommendations</h3>
        <ul className="recs">
          {recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
      </div>

      <div className="note">Note: This calculator models a savings "offset" simply by reducing the interest-bearing principal by the savings balance each month. For bank-specific sweep/offset behaviour (e.g. daily averaging, min-balance rules, tax/legal considerations), consult your lender.</div>
    </div>
  );
}
