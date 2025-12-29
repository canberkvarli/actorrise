import { SearchInterface } from "@/components/search/SearchInterface";

export default function SearchPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">MonologueMatch</h1>
        <p className="text-muted-foreground">
          Discover the perfect monologue for your next audition
        </p>
      </div>
      <SearchInterface />
    </div>
  );
}



