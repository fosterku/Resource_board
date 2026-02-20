import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ActiveSessionProvider } from "@/context/ActiveSessionContext";
import { pingService } from "@/services/pingService";
import { useEffect } from "react";
import HomePage from "@/pages/home";
import LoginPage from "@/pages/login";
import MapPage from "@/pages/map";
import ContractorsPage from "@/pages/contractors";
import AvailabilityPage from "@/pages/availability";
import ContractorAvailabilityForm from "@/pages/contractor-form";
import UtilityAdmin from "@/pages/utility-admin";
import CompaniesPage from "@/pages/companies";
import SessionsPage from "@/pages/sessions";
import RostersPage from "@/pages/rosters";
import RosterDetailPage from "@/pages/roster-detail";
import TimesheetsPage from "@/pages/timesheets";
import TimesheetDetailPage from "@/pages/timesheet-detail";
import ExpensesPage from "@/pages/expenses";
import InvoicesPage from "@/pages/invoices";
import ReportsPage from "@/pages/reports";
import UsersPage from "@/pages/users";
import AccessManagementPage from "@/pages/access-management";
import ContractorProfilePage from "@/pages/contractor-profile";
import TicketsPage from "@/pages/tickets";
import StormManagementPage from "@/pages/storm-management";
import NotFound from "@/pages/not-found";

function AuthenticatedRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/map" component={MapPage} />
      <Route path="/contractors" component={ContractorsPage} />
      <Route path="/availability" component={AvailabilityPage} />
      <Route path="/utility-admin" component={UtilityAdmin} />
      <Route path="/companies" component={CompaniesPage} />
      <Route path="/sessions" component={SessionsPage} />
      <Route path="/storm/:id" component={StormManagementPage} />
      <Route path="/rosters/:id" component={RosterDetailPage} />
      <Route path="/rosters" component={RostersPage} />
      <Route path="/timesheets/:id" component={TimesheetDetailPage} />
      <Route path="/timesheets" component={TimesheetsPage} />
      <Route path="/expenses" component={ExpensesPage} />
      <Route path="/invoices" component={InvoicesPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/users" component={UsersPage} />
      <Route path="/access-management" component={AccessManagementPage} />
      <Route path="/tickets/:id" component={TicketsPage} />
      <Route path="/tickets" component={TicketsPage} />
      <Route path="/profile" component={ContractorProfilePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRouter() {
  return (
    <Switch>
      {/* Public contractor form route - no authentication required */}
      <Route path="/contractor-availability" component={ContractorAvailabilityForm} />
      <Route path="*" component={AuthenticatedRouter} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    // Start the ping service to keep the app awake
    pingService.start();
    
    // Cleanup on unmount
    return () => {
      pingService.stop();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ActiveSessionProvider>
            <Toaster />
            <PublicRouter />
          </ActiveSessionProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
