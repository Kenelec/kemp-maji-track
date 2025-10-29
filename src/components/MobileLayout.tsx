import React, { useState, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

interface MobileLayoutProps {
  children: ReactNode;
  headerTitle: string;
  sidebarContent?: ReactNode;
  showSidebar?: boolean;
  onLogout?: () => void;
}

const MobileLayout: React.FC<MobileLayoutProps> = ({
  children,
  headerTitle,
  sidebarContent,
  showSidebar = true,
  onLogout
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="flex h-16 items-center justify-between px-4">
          {showSidebar && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden"
            >
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          )}
          <h1 className="text-lg font-bold text-foreground text-center flex-1">
            {headerTitle}
          </h1>
          {onLogout && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onLogout}
              className="hidden md:block"
            >
              Logout
            </Button>
          )}
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {showSidebar && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      {showSidebar && (
        <aside 
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-300 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } md:translate-x-0 md:static md:w-64`}
        >
          <div className="p-4">
            <div className="flex justify-between items-center mb-6 md:hidden">
              <h2 className="text-lg font-semibold">Menu</h2>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            {sidebarContent}
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className={`p-4 transition-all duration-300 ${
        showSidebar && sidebarOpen ? 'opacity-50' : 'opacity-100'
      } ${showSidebar ? 'md:ml-64' : ''}`}>
        {children}
      </main>

      {/* Mobile Logout Button */}
      {onLogout && (
        <div className="md:hidden fixed bottom-4 right-4 z-40">
          <Button 
            variant="outline"
            onClick={onLogout}
            className="bg-primary text-primary-foreground"
          >
            Logout
          </Button>
        </div>
      )}
    </div>
  );
};

export default MobileLayout;
