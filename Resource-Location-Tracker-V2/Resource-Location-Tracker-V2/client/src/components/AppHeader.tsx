import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Map, Users, Calendar, Bird, Building2, CloudRain, ClipboardList, Clock, Receipt, FileText, BarChart3, Settings, UserCog, Star, Ticket, Menu, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useActiveSession } from "@/context/ActiveSessionContext";
import { Badge } from "@/components/ui/badge";

interface AppHeaderProps {
}

export default function AppHeader({}: AppHeaderProps) {
  const { user, logout } = useAuth();
  const { activeSession, isLoading } = useActiveSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  const isActive = (path: string) => location === path;

  const navLinkClass = (path: string) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive(path)
        ? 'bg-blue-50 text-blue-700'
        : 'text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-[99999] bg-white shadow-sm border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <Bird className="text-primary-foreground" size={14} />
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="text-sm sm:text-lg font-semibold text-gray-900 truncate">Resource Locator</h1>
              {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'UTILITY') && !isLoading && (
                <div className="flex items-center space-x-1 text-xs">
                  {activeSession ? (
                    <Badge variant="default" className="text-[10px] py-0 px-1 flex items-center gap-1" data-testid="badge-active-session">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      <span className="truncate max-w-[100px] sm:max-w-none">{activeSession.name}</span>
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1" data-testid="badge-no-session">
                      No active session
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center space-x-1">
              <Button variant="outline" size="sm" asChild>
                <Link href="/map">
                  <Map className="mr-1" size={14} />
                  Map
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/contractors">
                  <Users className="mr-1" size={14} />
                  Contractors
                </Link>
              </Button>

              {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'UTILITY') && (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/companies">
                      <Building2 className="mr-1" size={14} />
                      Companies
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/sessions">
                      <CloudRain className="mr-1" size={14} />
                      Sessions
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/tickets">
                      <Ticket className="mr-1" size={14} />
                      Tickets
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/rosters">
                      <ClipboardList className="mr-1" size={14} />
                      Rosters
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/timesheets">
                      <Clock className="mr-1" size={14} />
                      Timesheets
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/expenses">
                      <Receipt className="mr-1" size={14} />
                      Expenses
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/invoices">
                      <FileText className="mr-1" size={14} />
                      Invoices
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/reports">
                      <BarChart3 className="mr-1" size={14} />
                      Reports
                    </Link>
                  </Button>
                </>
              )}

              {user?.role === 'ADMIN' && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/users">
                    <Settings className="mr-1" size={14} />
                    Users
                  </Link>
                </Button>
              )}

              {user?.role === 'MANAGER' && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/access-management">
                    <UserCog className="mr-1" size={14} />
                    Access
                  </Link>
                </Button>
              )}

              {user?.role === 'CONTRACTOR' && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/profile">
                    <Building2 className="mr-1" size={14} />
                    Profile
                  </Link>
                </Button>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2 ml-2">
              <span className="text-sm text-gray-600 truncate max-w-[150px]">{user?.email}</span>
              <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="md:hidden p-1.5"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </Button>

            <Button variant="outline" size="sm" className="sm:hidden text-xs" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[99998] md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <nav
            className="absolute top-[52px] left-0 right-0 bg-white border-b shadow-lg max-h-[calc(100vh-52px)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b bg-gray-50">
              <p className="text-xs text-gray-500">Signed in as</p>
              <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
              <Badge className="text-[10px] mt-1">{user?.role}</Badge>
            </div>

            <div className="py-2 px-3 space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold px-3 pt-2 pb-1">Resource Tools</p>
              <Link href="/map" onClick={() => setMobileMenuOpen(false)}>
                <span className={navLinkClass('/map')}><Map size={16} /> Map Analysis</span>
              </Link>
              <Link href="/contractors" onClick={() => setMobileMenuOpen(false)}>
                <span className={navLinkClass('/contractors')}><Users size={16} /> Contractors</span>
              </Link>
              <Link href="/availability" onClick={() => setMobileMenuOpen(false)}>
                <span className={navLinkClass('/availability')}><Calendar size={16} /> Availability</span>
              </Link>

              {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'UTILITY') && (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold px-3 pt-3 pb-1">Storm Response</p>
                  <Link href="/companies" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/companies')}><Building2 size={16} /> Companies</span>
                  </Link>
                  <Link href="/sessions" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/sessions')}><CloudRain size={16} /> Sessions</span>
                  </Link>
                  <Link href="/tickets" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/tickets')}><Ticket size={16} /> Tickets</span>
                  </Link>
                  <Link href="/rosters" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/rosters')}><ClipboardList size={16} /> Rosters</span>
                  </Link>
                  <Link href="/timesheets" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/timesheets')}><Clock size={16} /> Timesheets</span>
                  </Link>
                  <Link href="/expenses" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/expenses')}><Receipt size={16} /> Expenses</span>
                  </Link>
                  <Link href="/invoices" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/invoices')}><FileText size={16} /> Invoices</span>
                  </Link>
                  <Link href="/reports" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/reports')}><BarChart3 size={16} /> Reports</span>
                  </Link>
                </>
              )}

              {user?.role === 'ADMIN' && (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold px-3 pt-3 pb-1">Admin</p>
                  <Link href="/users" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/users')}><Settings size={16} /> User Management</span>
                  </Link>
                </>
              )}

              {user?.role === 'MANAGER' && (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold px-3 pt-3 pb-1">Admin</p>
                  <Link href="/access-management" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/access-management')}><UserCog size={16} /> Access Management</span>
                  </Link>
                </>
              )}

              {user?.role === 'CONTRACTOR' && (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold px-3 pt-3 pb-1">My Company</p>
                  <Link href="/profile" onClick={() => setMobileMenuOpen(false)}>
                    <span className={navLinkClass('/profile')}><Building2 size={16} /> Company Profile</span>
                  </Link>
                </>
              )}
            </div>

            <div className="px-4 py-3 border-t">
              <Button variant="outline" size="sm" className="w-full" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                Logout
              </Button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
