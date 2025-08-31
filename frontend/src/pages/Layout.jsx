import * as React from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  AppBar, Box, CssBaseline, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Toolbar, Typography
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import WalletIcon from "@mui/icons-material/Wallet";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import EventIcon from "@mui/icons-material/Event";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import SavingsIcon from "@mui/icons-material/Savings";
import NotificationsIcon from "@mui/icons-material/Notifications";
import HomeIcon from '@mui/icons-material/Home';

const drawerWidth = 240;

const links = [
  { to: "/", label: "Home", icon: <HomeIcon /> },
  { to: "/income", label: "Income Management", icon: <WalletIcon /> },
  { to: "/commitments", label: "Commitments", icon: <AccountBalanceIcon /> },
  { to: "/events", label: "Events", icon: <EventIcon /> },
  { to: "/daily", label: "Daily Expenses", icon: <ShoppingCartIcon /> },
  { to: "/savings", label: "Savings", icon: <SavingsIcon /> },
  { to: "/notifications", label: "Notifications", icon: <NotificationsIcon /> },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap>My Budget Pal</Typography>
      </Toolbar>
      <Divider />
      <List sx={{ px: 1 }}>
        {links.map(({ to, label, icon }) => {
          const active = location.pathname === to;
          return (
            <ListItemButton
              key={to}
              component={NavLink}
              to={to}
              sx={{ borderRadius: 1, my: 0.5, ...(active && { bgcolor: "action.selected" }) }}
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon>{icon}</ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          );
        })}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <CssBaseline />

      {/* Shift AppBar on desktop so it doesn't sit under the drawer */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          {/* Hamburger only on mobile */}
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ mr: 2, display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap>
            {links.find(l => l.to === location.pathname)?.label || "My Budget Pal"}
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Mobile drawer (overlays) */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth },
        }}
      >
        {drawer}
      </Drawer>

      {/* Desktop drawer (pushes content) */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth },
        }}
        open
      >
        {drawer}
      </Drawer>

      {/* Main content gets left margin on desktop and top spacing under AppBar */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
      >
        {/* pushes content below AppBar */}
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
