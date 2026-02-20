import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, MapPin, Activity, LogIn } from 'lucide-react';

export default function LoginPage() {
  const { login, isLoading } = useAuth();

  const handleLogin = () => {
    login(); // Redirects to /api/login
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Title */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 text-white rounded-full">
            <Zap className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">BirdStorm</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">Utility Storm Response Management</p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Sign In</CardTitle>
            <CardDescription className="text-center">
              Sign in with your Replit account to access storm response management
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleLogin} 
              className="w-full h-12" 
              disabled={isLoading}
              data-testid="button-login"
            >
              <LogIn className="mr-2 h-5 w-5" />
              Sign in with Replit
            </Button>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
              You'll be redirected to Replit to authenticate
            </p>
          </CardContent>
        </Card>

        {/* Features Preview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <MapPin className="w-6 h-6 text-blue-600 mx-auto mb-2" />
            <h3 className="font-semibold text-sm">Resource Mapping</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">Locate resources instantly</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <Activity className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <h3 className="font-semibold text-sm">Crew Management</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">Track crews and equipment</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <Zap className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
            <h3 className="font-semibold text-sm">Storm Response</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">Fast emergency response</p>
          </div>
        </div>
      </div>
    </div>
  );
}
