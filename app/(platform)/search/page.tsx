import { IconSparkles, IconTools } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";

export default function SearchPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">MonologueMatch</h1>
        <p className="text-muted-foreground">
          Discover the perfect monologue for your next audition
        </p>
      </div>
      
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-12 pb-12 px-8">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                <div className="relative bg-primary/10 p-6 rounded-full">
                  <IconTools className="h-16 w-16 text-primary" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Under Construction</h2>
                <p className="text-muted-foreground text-lg">
                  Our AI-powered search feature is being enhanced to provide you with the best monologue recommendations.
                </p>
              </div>
              
              <div className="pt-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-full">
                  <IconSparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Coming Soon</span>
                </div>
              </div>
              
              <div className="pt-6 text-sm text-muted-foreground max-w-md">
                <p>
                  We're working hard to bring you intelligent search capabilities that understand context, 
                  match your profile, and find the perfect monologues for your auditions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}



