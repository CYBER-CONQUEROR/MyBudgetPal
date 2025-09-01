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
import Home from "./pages/Home";
import BudgetPlanPage from "./pages/BudgetPlanPage";

const theme = createTheme({
  palette: { mode: "light", primary: { main: "#1976d2" } },
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/income" element={<SalaryPage />} />
            <Route path="/budget" element={<BudgetPlanPage />} />
            <Route path="/commitments" element={<CommitmentsPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/daily" element={<DtdExpense />} />
            <Route path="/savings" element={<SavingsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
