import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface CompetitorsLoadingStateProps {
  workspaceLoading: boolean;
  isLoading: boolean;
}

export default function CompetitorsLoadingState({
  workspaceLoading,
  isLoading: _,
}: CompetitorsLoadingStateProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Competitors</h1>
          <p className="text-muted-foreground">
            {workspaceLoading ? "Loading workspace..." : "Loading competitor data..."}
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton height={16} />
            </CardHeader>
            <CardContent>
              <Skeleton height={256} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}