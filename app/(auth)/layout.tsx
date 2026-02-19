import { PageTransitionWithKey } from "@/components/transition/PageTransition";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PageTransitionWithKey>{children}</PageTransitionWithKey>;
}
