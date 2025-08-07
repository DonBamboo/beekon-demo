import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoadingState() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Loading dashboard data...
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton height={16} />
            </CardHeader>
            <CardContent>
              <Skeleton height={32} className="mb-2" />
              <Skeleton height={12} className="w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton height={16} className="w-1/3" />
          <Skeleton height={12} className="w-1/2" />
        </CardHeader>
        <CardContent>
          <Skeleton height={256} />
        </CardContent>
      </Card>
    </div>
  );
}