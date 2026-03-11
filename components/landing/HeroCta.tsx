"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalContext";

export function HeroCta() {
  const { user } = useAuth();
  const authModal = useAuthModal();
  const router = useRouter();

  const handleClick = () => {
    if (user) {
      router.push("/my-scripts");
    } else {
      authModal?.openAuthModal("signup");
    }
  };

  return (
    <Button
      size="lg"
      className="h-14 sm:h-16 px-10 sm:px-14 text-base sm:text-lg font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
      onClick={handleClick}
    >
      Start rehearsing
    </Button>
  );
}
