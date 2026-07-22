import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Settings, Edit, Eye } from 'lucide-react';

interface Setting {
  id: string;
  setting_key: string;
  setting_value: string;
  description: string;
  updated_at: string;
  updated_by: string;
}

export const SystemSettingsSection = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [sortField, setSortField] = useState<keyof Setting | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    setLoading(true);
    
    let query = supabase
      .from('system_settings')
      .select('*');

    // Apply sorting if field is selected
    if (sortField) {
      query = query.order(sortField, { ascending: sortOrder === 'asc' });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching settings:', error);
    } else {
      setSettings(data || []);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, [sortField, sortOrder]);

  const handleSort = (field: keyof Setting) => {
    if (sortField === field) {
      // Toggle sort order if clicking same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Sort by new field in ascending order
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field: keyof Setting) => {
    if (sortField !== field) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return <div className="text-center py-8">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">System Settings</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('setting_key')}
                  >
                    Setting {getSortIcon('setting_key')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('setting_value')}
                  >
                    Value {getSortIcon('setting_value')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('updated_at')}
                  >
                    Last Updated {getSortIcon('updated_at')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('updated_by')}
                  >
                    Updated By {getSortIcon('updated_by')}
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.map((setting) => (
                  <TableRow key={setting.id}>
                    <TableCell className="font-medium">{setting.setting_key}</TableCell>
                    <TableCell>{setting.setting_value}</TableCell>
                    <TableCell>{new Date(setting.updated_at).toLocaleDateString()}</TableCell>
                    <TableCell>{setting.updated_by}</TableCell>
                    <TableCell>
                      {user?.role === 'master_admin' ? (
                        <Button size="sm" variant="outline">
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled title="Admin cannot edit settings">
                          <Eye className="w-4 h-4 mr-2" />
                          View Only
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
