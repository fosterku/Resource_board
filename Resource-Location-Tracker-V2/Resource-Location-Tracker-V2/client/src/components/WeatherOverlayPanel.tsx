import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Cloud, Zap, AlertTriangle, Users, RefreshCw, Eye, EyeOff, Download } from "lucide-react";
import { useWeatherData } from "@/hooks/useWeatherData";
import type { ElectricUtility } from "@/hooks/useWeatherData";

interface WeatherOverlayPanelProps {
  onToggleOutlookLayer: (enabled: boolean) => void;
  onToggleUtilitiesLayer: (enabled: boolean) => void;
  isOutlookLayerVisible: boolean;
  isUtilitiesLayerVisible: boolean;
  visibleDays?: { [key: number]: boolean };
  onToggleDay?: (day: number, enabled: boolean) => void;
}

export default function WeatherOverlayPanel({
  onToggleOutlookLayer,
  onToggleUtilitiesLayer,
  isOutlookLayerVisible,
  isUtilitiesLayerVisible,
  visibleDays = { 1: true, 2: true, 3: true },
  onToggleDay = () => {}
}: WeatherOverlayPanelProps) {
  const [affectedUtilities, setAffectedUtilities] = useState<ElectricUtility[]>([]);
  const [showUtilitiesList, setShowUtilitiesList] = useState(false);
  
  const {
    outlookData,
    utilitiesData,
    isOutlookLoading,
    isUtilitiesLoading,
    isCalculatingAffected,
    outlookError,
    utilitiesError,
    calculationError,
    loadWeatherData,
    calculateAffectedUtilities
  } = useWeatherData();

  const handleLoadWeatherData = async () => {
    try {
      await loadWeatherData();
    } catch (error) {
      console.error('Failed to load weather data:', error);
    }
  };

  const handleCalculateAffected = async () => {
    if (!outlookData) {
      return;
    }
    
    try {
      const utilities = await calculateAffectedUtilities(outlookData);
      setAffectedUtilities(utilities);
      setShowUtilitiesList(true);
    } catch (error) {
      console.error('Failed to calculate affected utilities:', error);
    }
  };

  const getRiskColor = (category: string): string => {
    switch (category.toUpperCase()) {
      case 'HIGH': return 'bg-red-600';
      case 'MDT': return 'bg-orange-500';
      case 'ENH': return 'bg-yellow-500';
      case 'SLGT': return 'bg-green-500';
      default: return 'bg-gray-400';
    }
  };

  const getRiskLabel = (category: string): string => {
    switch (category.toUpperCase()) {
      case 'HIGH': return 'High Risk';
      case 'MDT': return 'Moderate Risk';
      case 'ENH': return 'Enhanced Risk';
      case 'SLGT': return 'Slight Risk';
      default: return category;
    }
  };

  const getTotalCustomersAffected = (): number => {
    return affectedUtilities.reduce((total, utility) => total + utility.customers, 0);
  };

  const exportToExcel = () => {
    if (affectedUtilities.length === 0) return;

    // Prepare data for Excel export
    const exportData = affectedUtilities.map((utility, index) => ({
      'Rank': index + 1,
      'Utility Name': utility.name,
      'Customers': utility.customers,
      'Highest Risk Level': utility.highestRiskLevel || 'Unknown',
      'All Risk Levels': utility.riskLevels ? utility.riskLevels.join(', ') : utility.highestRiskLevel || 'Unknown',
      'Intersecting Area (sq units)': utility.intersectingArea || 0
    }));

    // Add summary row
    const summaryData = {
      'Rank': 'TOTAL',
      'Utility Name': 'ALL AFFECTED UTILITIES',
      'Customers': getTotalCustomersAffected(),
      'Highest Risk Level': '',
      'All Risk Levels': '',
      'Intersecting Area (sq units)': ''
    };

    const finalData = [...exportData, summaryData];

    // Create CSV content
    const headers = Object.keys(exportData[0]);
    const csvContent = [
      headers.join(','),
      ...exportData.map(row => headers.map(header => `"${(row as any)[header]}"`).join(',')),
      // Add summary row separately to avoid type issues
      `"TOTAL","ALL AFFECTED UTILITIES","${getTotalCustomersAffected()}","","",""`
    ].join('\n');

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    link.setAttribute('download', `affected_utilities_${timestamp}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-sm font-medium">
          <Cloud className="w-4 h-4 mr-2 text-blue-600" />
          Wind Outlook (5%+)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Load Weather Data Button */}
        <Button 
          onClick={handleLoadWeatherData}
          disabled={isOutlookLoading || isUtilitiesLoading}
          className="w-full"
          size="sm"
        >
          {(isOutlookLoading || isUtilitiesLoading) ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Cloud className="w-4 h-4 mr-2" />
              Load Weather Data
            </>
          )}
        </Button>

        {/* Error Handling */}
        {(outlookError || utilitiesError || calculationError) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {outlookError?.message || utilitiesError?.message || calculationError?.message || 'Weather data error'}
            </AlertDescription>
          </Alert>
        )}

        {/* Layer Controls */}
        {outlookData && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="outlook-layer" className="text-xs">SPC Outlook (All Days)</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="outlook-layer"
                  checked={isOutlookLayerVisible}
                  onCheckedChange={(checked) => {
                    onToggleOutlookLayer(checked);
                    // Auto-enable all days when turning on SPC outlook
                    if (checked) {
                      console.log('Auto-enabling all day layers for SPC outlook');
                    }
                  }}
                />
                {isOutlookLayerVisible ? (
                  <Eye className="w-3 h-3 text-gray-500" />
                ) : (
                  <EyeOff className="w-3 h-3 text-gray-400" />
                )}
              </div>
            </div>

            {/* Individual Day Controls - show when outlook is enabled */}
            {isOutlookLayerVisible && (
              <div className="ml-4 space-y-2 border-l-2 border-gray-200 pl-3">
                <div className="text-xs text-gray-600">Show Days:</div>
                {[1, 2, 3].map(day => {
                  const dayFeatures = outlookData.features.filter(f => f.properties.outlook_day === day);
                  const hasData = dayFeatures.length > 0;
                  const categorySet = new Set(dayFeatures.map(f => f.properties.category));
                  const riskLevels = Array.from(categorySet);
                  
                  return (
                    <div key={day} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Label htmlFor={`day-${day}`} className="text-xs">
                          Day {day} 
                          {hasData && (
                            <span className="text-gray-500">
                              ({riskLevels.join(', ')})
                            </span>
                          )}
                        </Label>
                      </div>
                      <Switch
                        id={`day-${day}`}
                        checked={hasData && visibleDays[day]}
                        disabled={!hasData}
                        onCheckedChange={(checked) => onToggleDay(day, checked)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {utilitiesData && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="utilities-layer" className="text-xs">Electric Utilities</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="utilities-layer"
                      checked={isUtilitiesLayerVisible && utilitiesData.features.length > 0}
                      onCheckedChange={onToggleUtilitiesLayer}
                      disabled={utilitiesData.features.length === 0}
                    />
                    {isUtilitiesLayerVisible ? (
                      <Eye className="w-3 h-3 text-gray-500" />
                    ) : (
                      <EyeOff className="w-3 h-3 text-gray-400" />
                    )}
                  </div>
                </div>
                
                {utilitiesData.error && (
                  <Alert className="border-orange-200 bg-orange-50">
                    <AlertTriangle className="h-3 w-3 text-orange-600" />
                    <AlertDescription className="text-xs text-orange-700">
                      {utilitiesData.error.message}
                      <div className="mt-1 text-xs text-orange-600">
                        All other map features remain fully functional.
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        )}

        

        {/* Calculate Affected Utilities */}
        {outlookData && utilitiesData && (
          <Button 
            onClick={handleCalculateAffected}
            disabled={isCalculatingAffected}
            variant="outline"
            className="w-full"
            size="sm"
          >
            {isCalculatingAffected ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Calculating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Find Affected Utilities
              </>
            )}
          </Button>
        )}

        {/* Affected Utilities Results */}
        {showUtilitiesList && affectedUtilities.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-gray-700">Potentially Affected Utilities</h4>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="text-xs">
                  <Users className="w-3 h-3 mr-1" />
                  {getTotalCustomersAffected().toLocaleString()} customers
                </Badge>
                <Button
                  onClick={exportToExcel}
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  title="Export to Excel/CSV"
                >
                  <Download className="w-3 h-3" />
                </Button>
              </div>
            </div>
            
            <div className="max-h-40 overflow-y-auto space-y-1">
              {affectedUtilities.slice(0, 10).map((utility, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{utility.name}</div>
                    {utility.highestRiskLevel && (
                      <div className="flex items-center space-x-1 mt-1">
                        <Badge 
                          variant="secondary" 
                          className={`text-white text-xs px-1 py-0 ${getRiskColor(utility.highestRiskLevel)}`}
                        >
                          {utility.highestRiskLevel}
                        </Badge>
                        {utility.riskLevels && utility.riskLevels.length > 1 && (
                          <span className="text-gray-400 text-xs">+{utility.riskLevels.length - 1}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-blue-600 text-sm">{utility.customers.toLocaleString()}</div>
                    <div className="text-gray-400 text-xs">customers</div>
                  </div>
                </div>
              ))}
              
              {affectedUtilities.length > 10 && (
                <div className="text-xs text-gray-500 text-center py-1">
                  +{affectedUtilities.length - 10} more utilities
                </div>
              )}
            </div>
          </div>
        )}

        {showUtilitiesList && affectedUtilities.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-2">
            No utilities found in risk areas
          </div>
        )}

        </CardContent>
    </Card>
  );
}