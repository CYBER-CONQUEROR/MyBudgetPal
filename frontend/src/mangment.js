import './App.css';

function PaymentManagement() {
  return (
    <div className="App">
      <header className="App-header">
        <button className="btn-back" onClick={() => window.history.back()}>
          ← Back to Dashboard
        </button>
        <h1>Payment Management</h1>

        <div className="card add-payment" onClick={() => alert('Go to Add Payment Form')}>
          + Add New Payment
        </div>

        <div className="payment-schedule">
          <h2>📋 Payment Schedule</h2>
          <table>
            <thead>
              <tr>
                <th>Payment Name</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Account</th>
                <th>Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Home Loan</td>
                <td>LKR 25,000</td>
                <td>2025-08-25</td>
                <td>Savings Account</td>
                <td><span className="type-loan">Loan</span></td>
                <td><span className="status-pending">Pending</span></td>
                <td><button className="btn-delete">Delete</button></td>
              </tr>
              <tr>
                <td>Credit Card Bill</td>
                <td>LKR 15,000</td>
                <td>2025-08-30</td>
                <td>Current Account</td>
                <td><span className="type-credit">Credit Card</span></td>
                <td><span className="status-pending">Pending</span></td>
                <td><button className="btn-delete">Delete</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </header>
    </div>
  );
}

export default PaymentManagement;
