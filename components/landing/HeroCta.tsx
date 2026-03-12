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
      className="h-12 sm:h-14 md:h-16 px-8 sm:px-12 md:px-14 text-sm sm:text-base md:text-lg font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
      onClick={handleClick}
    >
      Start rehearsing
    </Button>
  );
}
