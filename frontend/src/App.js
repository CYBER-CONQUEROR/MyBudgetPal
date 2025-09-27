import * as React from "react";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./pages/Layout";
import SalaryPage from "./pages/SalaryPage";
import CommitmentsPage from "./pages/bank";
import EventsPage from "./pages/EventsPage";
import DtdExpense from './pages/DailyPage';
import SavingsPage from "./pages/SavingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import Dash from "./pages/userDash";
import BudgetPlanPage from "./pages/BudgetPlanPage";
import AccountPage from "./pages/bankAccountManagement";
import ForcastPage from "./pages/BudgetForecast";
import Home from "./pages/Home";
import Contact from "./pages/ContactUs";
import Header from "./pages/headerfooter";
import Login from "./pages/Login";
import AboutUs from "./pages/Aboutus";
import Privacy from "./pages/privacy";
import SignUp from "./pages/SignUpPage";
import Terms from "./pages/TermsAndConditions";
import Profile from "./pages/ProfilePage";
const theme = createTheme({
  palette: { mode: "light", primary: { main: "#1976d2" } },
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route element={<Header />}>
            <Route index element={<Home />} />             {/* ✅ index route for home */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<SignUp />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/aboutus" element={<AboutUs />} />
            <Route path="/contactus" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
          </Route>

          <Route element={<Layout />}>
            <Route path="/dash" element={<Dash />} />
            <Route path="/income" element={<SalaryPage />} />
            <Route path="/budget" element={<BudgetPlanPage />} />
            <Route path="/accounts" element={<AccountPage />} />
            <Route path="/commitments" element={<CommitmentsPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/daily" element={<DtdExpense />} />
            <Route path="/savings" element={<SavingsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/budget/forecast" element={<ForcastPage />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
