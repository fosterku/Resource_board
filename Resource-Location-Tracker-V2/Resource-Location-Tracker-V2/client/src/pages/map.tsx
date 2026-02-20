import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";
import Sidebar from "@/components/Sidebar";
import MapContainer from "@/components/MapContainer";
import ResultsTable from "@/components/ResultsTable";
import ExportModal from "@/components/ExportModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useMapData } from "@/hooks/useMapData";
import type { Contractor } from "@shared/schema";

export default function MapPage() {
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [isSelectingPoint, setIsSelectingPoint] = useState(false);
  const [closestDistance, setClosestDistance] = useState<number | null>(null);
  const [maxDistance, setMaxDistance] = useState<number | null>(null);
  const [maxHours, setMaxHours] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);
  const [isOutlookLayerVisible, setIsOutlookLayerVisible] = useState(false);
  const [isUtilitiesLayerVisible, setIsUtilitiesLayerVisible] = useState(false);
  const [visibleDays, setVisibleDays] = useState<{ [key: number]: boolean }>({
    1: true,
    2: true,
    3: true
  });
  const { 
    resources, 
    analysisPoints, 
    uploadFile, 
    createAnalysisPoint, 
    deleteAnalysisPoint,
    calculateDistances,
    isLoading 
  } = useMapData((pointId) => setSelectedPointId(pointId));

  // Fetch contractors to display their departure locations on the map
  const { data: contractors = [] } = useQuery<Contractor[]>({
    queryKey: ["/api/contractors"],
  });

  const handleCreatePoint = (point: { label: string; latitude: number; longitude: number }) => {
    createAnalysisPoint(point);
    setIsSelectingPoint(false);
  };

  const handleRecalculateDistances = (pointId: number, maxDistance?: number) => {
    // Check if point still exists before calculating
    const pointExists = analysisPoints.some(p => p.id === pointId);
    if (!pointExists) {
      console.error('Cannot recalculate: analysis point no longer exists');
      return;
    }
    calculateDistances({ pointId, maxDistance });
  };

  const handleToggleDay = (day: number, enabled: boolean) => {
    setVisibleDays(prev => ({
      ...prev,
      [day]: enabled
    }));
  };

  const handleToggleOutlookLayer = (enabled: boolean) => {
    setIsOutlookLayerVisible(enabled);
    // Auto-enable all days when turning on SPC outlook
    if (enabled) {
      setVisibleDays({ 1: true, 2: true, 3: true });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      {/* Main content area with proper mobile spacing */}
      <div className="pt-14 sm:pt-16 h-screen flex flex-col">
        <div className="flex-1 flex relative overflow-hidden">
          {/* Sidebar - Responsive */}
          <div className={`
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
            fixed md:relative z-[9998] md:z-auto
            w-80 md:w-80 
            h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] md:h-full
            top-14 sm:top-16 md:top-0
            transition-transform duration-300 ease-in-out
            md:transform-none
            bg-white shadow-lg md:shadow-none
            overflow-y-auto
          `}>
            <Sidebar
              resources={resources}
              analysisPoints={analysisPoints}
              onUploadFile={uploadFile}
              onCreatePoint={handleCreatePoint}
              onDeletePoint={deleteAnalysisPoint}
              onSelectPoint={setSelectedPointId}
              selectedPointId={selectedPointId}
              isLoading={isLoading}
              isSelectingPoint={isSelectingPoint}
              onTogglePointSelection={() => setIsSelectingPoint(!isSelectingPoint)}
              onClosestDistanceChange={setClosestDistance}
              onMaxDistanceChange={setMaxDistance}
              onMaxHoursChange={setMaxHours}
              onRecalculateDistances={handleRecalculateDistances}
              onToggleOutlookLayer={setIsOutlookLayerVisible}
              onToggleUtilitiesLayer={setIsUtilitiesLayerVisible}
              isOutlookLayerVisible={isOutlookLayerVisible}
              isUtilitiesLayerVisible={isUtilitiesLayerVisible}
              visibleDays={visibleDays}
              onToggleDay={handleToggleDay}
            />
          </div>

          {/* Overlay for mobile when sidebar is open */}
          {isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/20 z-[9997] md:hidden top-14 sm:top-16"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
          
          {/* Main content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs defaultValue="map" className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Tab header with sidebar toggle - Fixed positioning on mobile */}
              <div className="fixed md:sticky top-14 sm:top-16 md:top-0 left-0 right-0 z-[9996] md:z-10 border-b bg-white px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-2 sm:gap-4">
                  {/* Mobile Sidebar Toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="md:hidden min-h-[44px] px-3"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  >
                    {isSidebarOpen ? <X size={16} /> : <Menu size={16} />}
                    <span className="ml-1 text-xs">Tools</span>
                  </Button>
                  
                  <TabsList className="grid w-full max-w-64 sm:max-w-80 grid-cols-2 h-10 sm:h-12 bg-gray-100 border-2 border-gray-200 shadow-md rounded-lg p-1">
                    <TabsTrigger value="map" className="text-xs sm:text-sm font-semibold h-full data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-200">Map</TabsTrigger>
                    <TabsTrigger value="table" className="text-xs sm:text-sm font-semibold h-full data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-200">Results</TabsTrigger>
                  </TabsList>
                </div>
                
                {/* Desktop Sidebar Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden md:flex items-center gap-2"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                >
                  <Menu size={16} />
                  {isSidebarOpen ? 'Hide' : 'Show'} Sidebar
                </Button>
              </div>
              
              <TabsContent value="map" className="flex-1 m-0 p-0 h-full pt-16 md:pt-0">
                <div className="w-full h-full relative">
                  <MapContainer
                    key="map-container"
                    resources={resources}
                    analysisPoints={analysisPoints}
                    contractors={contractors}
                    selectedPointId={selectedPointId}
                    onCreatePoint={handleCreatePoint}
                    isSelectingPoint={isSelectingPoint}
                    closestDistance={closestDistance}
                    maxDistance={maxDistance}
                    maxHours={maxHours}
                    isOutlookLayerVisible={isOutlookLayerVisible}
                    isUtilitiesLayerVisible={isUtilitiesLayerVisible}
                    visibleDays={visibleDays}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="table" className="flex-1 m-0 p-2 sm:p-4 pt-16 md:pt-2">
                <ResultsTable
                  analysisPoints={analysisPoints}
                  selectedPointId={selectedPointId}
                  onSelectPoint={setSelectedPointId}
                  maxDistance={maxDistance}
                  maxHours={maxHours}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        selectedPointId={selectedPointId}
      />
    </div>
  );
}
