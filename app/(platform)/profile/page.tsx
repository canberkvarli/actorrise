import { ActorProfileForm } from "@/components/profile/ActorProfileForm";

export default function ProfilePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Actor Profile</h1>
        <p className="text-muted-foreground">
          The more you share, the better our AI understands you and the more accurate your monologue matches and recommendations.
        </p>
      </div>
      <ActorProfileForm />
    </div>
  );
}



