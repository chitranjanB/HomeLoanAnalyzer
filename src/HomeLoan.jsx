import React, { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
} from "recharts";

// Default export React component
export default function HomeLoanAnalyzer() {
  // --- Input state ---
  const [loanAmount, setLoanAmount] = useState(5000000); // ₹
  const [tenureYears, setTenureYears] = useState(20);
  const [tenureMonths, setTenureMonths] = useState(0);
  const [annualRate, setAnnualRate] = useState(7.4); // %
  const [emiStartDate, setEmiStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  // Prepayment options
  const [oneTimePrepayAmt, setOneTimePrepayAmt] = useState(0);
  const [oneTimePrepayDate, setOneTimePrepayDate] = useState("");
  const [recurringPrepayAmt, setRecurringPrepayAmt] = useState(0);
  const [recurringPrepayFreq, setRecurringPrepayFreq] = useState("yearly");

  // Savings-link option
  const [linkSavings, setLinkSavings] = useState(true);
  const [savingsBalance, setSavingsBalance] = useState(200000); // initial
  const [savingsGrowthMonthly, setSavingsGrowthMonthly] = useState(0); // ₹ change per month

  // Scenario selection (up to 3)
  const [scenarios, setScenarios] = useState(["Base", "Prepay", "Savings"]);

  // What-if slider quick controls
  const [whatIfSavings, setWhatIfSavings] = useState(200000);
  const [whatIfOneTime, setWhatIfOneTime] = useState(0);

  // Helpers
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
    savingsLink = false,
    savingsInit = 0,
    savingsMonthlyDrift = 0,
  }) {
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
      if (m > 10000) break; // safety

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
      if (schedule.length > Math.max(6000, months * 2)) break; // safety
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

  // Build three scenarios: base, with prepayment, with savings link
  const baseScenario = useMemo(() => {
    return buildSchedule({
      principal: loanAmount,
      months: totalMonths,
      annualRate,
      emiStartISO: emiStartDate,
      oneTimePrepay: 0,
      recurringPrepay: 0,
      savingsLink: false,
      savingsInit: 0,
      savingsMonthlyDrift: 0,
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
      savingsLink: false,
      savingsInit: 0,
      savingsMonthlyDrift: 0,
    });
  }, [loanAmount, totalMonths, annualRate, emiStartDate, oneTimePrepayAmt, oneTimePrepayDate, recurringPrepayAmt, recurringPrepayFreq, whatIfOneTime]);

  const savingsScenario = useMemo(() => {
    return buildSchedule({
      principal: loanAmount,
      months: totalMonths,
      annualRate,
      emiStartISO: emiStartDate,
      oneTimePrepay: 0,
      recurringPrepay: 0,
      savingsLink: linkSavings,
      savingsInit: whatIfSavings || savingsBalance,
      savingsMonthlyDrift: savingsGrowthMonthly,
    });
  }, [loanAmount, totalMonths, annualRate, emiStartDate, linkSavings, savingsBalance, whatIfSavings, savingsGrowthMonthly]);

  // For charts: prepare data points by month up to max length among scenarios
  const chartData = useMemo(() => {
    const maxLen = Math.max(baseScenario.schedule.length, prepayScenario.schedule.length, savingsScenario.schedule.length);
    const arr = [];
    for (let i = 0; i < maxLen; i++) {
      arr.push({
        month: i + 1,
        baseBalance: baseScenario.schedule[i] ? baseScenario.schedule[i].balance : 0,
        prepayBalance: prepayScenario.schedule[i] ? prepayScenario.schedule[i].balance : 0,
        savingsBalance: savingsScenario.schedule[i] ? savingsScenario.schedule[i].balance : 0,
        baseInterestCumu: baseScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
        prepayInterestCumu: prepayScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
        savingsInterestCumu: savingsScenario.schedule.slice(0, i + 1).reduce((s, x) => s + x.interestPaid, 0),
        principalComponent: baseScenario.schedule[i] ? baseScenario.schedule[i].principalPaid : 0,
        interestComponent: baseScenario.schedule[i] ? baseScenario.schedule[i].interestPaid : 0,
      });
    }
    return arr;
  }, [baseScenario, prepayScenario, savingsScenario]);

  // Recommendation generator (simple rules)
  function generateRecommendations() {
    const baseInterest = baseScenario.totals.totalInterest;
    const prepayInterest = prepayScenario.totals.totalInterest;
    const savingsInterest = savingsScenario.totals.totalInterest;

    const recs = [];
    if (linkSavings) {
      const saved = Math.max(0, baseInterest - savingsInterest);
      const monthsSaved = baseScenario.schedule.length - savingsScenario.schedule.length;
      recs.push(`Linking savings of ₹${(whatIfSavings || savingsBalance).toLocaleString()} saves approx ₹${saved.toFixed(0)} in interest and may shorten tenure by ${monthsSaved} months.`);
    }
    if ((oneTimePrepayAmt || whatIfOneTime) > 0) {
      const otp = oneTimePrepayAmt || whatIfOneTime;
      const saved = baseInterest - prepayScenario.totals.totalInterest;
      recs.push(`One-time prepayment of ₹${otp.toLocaleString()} saves approx ₹${saved.toFixed(0)} in interest.`);
    }
    if (recurringPrepayAmt > 0) {
      const saved = baseInterest - prepayScenario.totals.totalInterest;
      recs.push(`Recurring prepayment of ₹${recurringPrepayAmt} every ${recurringPrepayFreq} saves approx ₹${saved.toFixed(0)} in interest.`);
    }

    // Generic suggestion
    recs.push("Consider increasing monthly prepayment or linking more savings to accelerate payoff. Verify tax/liquidity needs before sweeping savings.");
    return recs;
  }

  const recommendations = useMemo(generateRecommendations, [baseScenario, prepayScenario, savingsScenario, linkSavings, savingsBalance, whatIfSavings, oneTimePrepayAmt, whatIfOneTime, recurringPrepayAmt]);

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

  // UI layout
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Home Loan Analyzer</h1>

      {/* Inputs Card */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <h2 className="font-medium mb-2">Loan Inputs</h2>
          <label className="block text-sm">Loan Amount (₹)</label>
          <input className="w-full p-2 border rounded mt-1" type="number" value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} />

          <div className="flex gap-2 mt-2">
            <div>
              <label className="block text-sm">Tenure (yrs)</label>
              <input type="number" className="p-2 border rounded mt-1 w-24" value={tenureYears} onChange={(e) => setTenureYears(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm">+ months</label>
              <input type="number" className="p-2 border rounded mt-1 w-24" value={tenureMonths} onChange={(e) => setTenureMonths(Number(e.target.value))} />
            </div>
          </div>

          <label className="block text-sm mt-2">Annual Interest Rate (%)</label>
          <input className="w-full p-2 border rounded mt-1" type="number" step="0.01" value={annualRate} onChange={(e) => setAnnualRate(Number(e.target.value))} />

          <label className="block text-sm mt-2">EMI Start Date</label>
          <input className="w-full p-2 border rounded mt-1" type="date" value={emiStartDate} onChange={(e) => setEmiStartDate(e.target.value)} />

          <hr className="my-3" />

          <h3 className="font-medium">Prepayment Options</h3>
          <label className="block text-sm mt-2">One-time Prepayment (₹)</label>
          <input type="number" className="w-full p-2 border rounded mt-1" value={oneTimePrepayAmt} onChange={(e) => setOneTimePrepayAmt(Number(e.target.value))} />
          <label className="block text-sm mt-2">Date for one-time prepayment</label>
          <input type="date" className="w-full p-2 border rounded mt-1" value={oneTimePrepayDate} onChange={(e) => setOneTimePrepayDate(e.target.value)} />

          <label className="block text-sm mt-2">Recurring prepayment (₹)</label>
          <div className="flex gap-2">
            <input type="number" className="flex-1 p-2 border rounded mt-1" value={recurringPrepayAmt} onChange={(e) => setRecurringPrepayAmt(Number(e.target.value))} />
            <select className="p-2 border rounded mt-1" value={recurringPrepayFreq} onChange={(e) => setRecurringPrepayFreq(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        </div>

        {/* Savings card */}
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <h2 className="font-medium mb-2">Savings Account Link</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={linkSavings} onChange={(e) => setLinkSavings(e.target.checked)} /> Link savings to offset principal
          </label>

          <label className="block text-sm mt-2">Current savings balance (₹)</label>
          <input type="number" className="w-full p-2 border rounded mt-1" value={savingsBalance} onChange={(e) => setSavingsBalance(Number(e.target.value))} />

          <label className="block text-sm mt-2">Monthly growth/decline in savings (₹)</label>
          <input type="number" className="w-full p-2 border rounded mt-1" value={savingsGrowthMonthly} onChange={(e) => setSavingsGrowthMonthly(Number(e.target.value))} />

          <hr className="my-3" />

          <h3 className="font-medium">What-if quick sliders</h3>
          <label className="block text-sm mt-2">Test savings to link: ₹{whatIfSavings.toLocaleString()}</label>
          <input type="range" min={0} max={loanAmount} value={whatIfSavings} onChange={(e) => setWhatIfSavings(Number(e.target.value))} />

          <label className="block text-sm mt-2">Test one-time prepayment: ₹{whatIfOneTime.toLocaleString()}</label>
          <input type="range" min={0} max={loanAmount} value={whatIfOneTime} onChange={(e) => setWhatIfOneTime(Number(e.target.value))} />
        </div>

        {/* Summary cards */}
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <h2 className="font-medium mb-2">Summary</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-sm">EMI (Base)</div>
              <div className="text-xl font-semibold">₹{baseScenario.emi.toLocaleString()}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-sm">Total Interest (Base)</div>
              <div className="text-xl font-semibold">₹{baseScenario.totals.totalInterest.toFixed(0).toLocaleString()}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-sm">Payoff after (months)</div>
              <div className="text-xl font-semibold">{baseScenario.schedule.length}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-sm">Total Cost (Principal + Interest)</div>
              <div className="text-xl font-semibold">₹{(loanAmount + baseScenario.totals.totalInterest).toFixed(0).toLocaleString()}</div>
            </div>
          </div>

          <div className="mt-4">
            <button className="px-4 py-2 rounded bg-sky-600 text-white" onClick={() => exportCSV(baseScenario.schedule, "base_amortization.csv")}>Export Base CSV</button>
            <button className="ml-2 px-4 py-2 rounded bg-green-600 text-white" onClick={() => exportCSV(prepayScenario.schedule, "prepay_amortization.csv")}>Export Prepay CSV</button>
          </div>
        </div>
      </div>

      {/* Charts and schedule tabs */}
      <div className="mt-6 grid lg:grid-cols-2 gap-4">
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <h3 className="font-medium mb-2">Remaining Balance Comparison</h3>
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
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl shadow-sm">
          <h3 className="font-medium mb-2">Cumulative Interest Comparison</h3>
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
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl shadow-sm lg:col-span-2">
          <h3 className="font-medium mb-2">Amortization Schedule (Base)</h3>
          <div className="overflow-auto max-h-80">
            <table className="w-full text-sm table-auto border-collapse">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="p-2 border">Month</th>
                  <th className="p-2 border">Date</th>
                  <th className="p-2 border">Payment</th>
                  <th className="p-2 border">Principal</th>
                  <th className="p-2 border">Interest</th>
                  <th className="p-2 border">Balance</th>
                  <th className="p-2 border">Savings Linked</th>
                </tr>
              </thead>
              <tbody>
                {baseScenario.schedule.slice(0, 500).map((r) => (
                  <tr key={r.month}>
                    <td className="p-2 border">{r.month}</td>
                    <td className="p-2 border">{r.date}</td>
                    <td className="p-2 border">₹{r.payment.toLocaleString()}</td>
                    <td className="p-2 border">₹{r.principalPaid.toLocaleString()}</td>
                    <td className="p-2 border">₹{r.interestPaid.toLocaleString()}</td>
                    <td className="p-2 border">₹{r.balance.toLocaleString()}</td>
                    <td className="p-2 border">₹{r.savingsLinked.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl shadow-sm lg:col-span-2">
          <h3 className="font-medium mb-2">Scenario Comparison (Quick)</h3>
          <table className="w-full text-sm table-auto border-collapse">
            <thead>
              <tr>
                <th className="p-2 border">Scenario</th>
                <th className="p-2 border">EMI</th>
                <th className="p-2 border">Payoff Months</th>
                <th className="p-2 border">Total Interest</th>
                <th className="p-2 border">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border">Base</td>
                <td className="p-2 border">₹{baseScenario.emi.toLocaleString()}</td>
                <td className="p-2 border">{baseScenario.schedule.length}</td>
                <td className="p-2 border">₹{baseScenario.totals.totalInterest.toFixed(0).toLocaleString()}</td>
                <td className="p-2 border">₹{(loanAmount + baseScenario.totals.totalInterest).toFixed(0).toLocaleString()}</td>
              </tr>
              <tr>
                <td className="p-2 border">Prepay</td>
                <td className="p-2 border">₹{prepayScenario.emi.toLocaleString()}</td>
                <td className="p-2 border">{prepayScenario.schedule.length}</td>
                <td className="p-2 border">₹{prepayScenario.totals.totalInterest.toFixed(0).toLocaleString()}</td>
                <td className="p-2 border">₹{(loanAmount + prepayScenario.totals.totalInterest).toFixed(0).toLocaleString()}</td>
              </tr>
              <tr>
                <td className="p-2 border">Savings Linked</td>
                <td className="p-2 border">₹{savingsScenario.emi.toLocaleString()}</td>
                <td className="p-2 border">{savingsScenario.schedule.length}</td>
                <td className="p-2 border">₹{savingsScenario.totals.totalInterest.toFixed(0).toLocaleString()}</td>
                <td className="p-2 border">₹{(loanAmount + savingsScenario.totals.totalInterest).toFixed(0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-white rounded-2xl shadow-sm lg:col-span-2">
          <h3 className="font-medium mb-2">Auto Recommendations</h3>
          <ul className="list-disc pl-6">
            {recommendations.map((r, i) => (
              <li key={i} className="mb-1">{r}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 text-sm text-gray-600">Note: This calculator models a savings "offset" simply by reducing the interest-bearing principal by the savings balance each month. For bank-specific sweep/offset behaviour (e.g. daily averaging, min-balance rules, tax/legal considerations), consult your lender.</div>
    </div>
  );
}
