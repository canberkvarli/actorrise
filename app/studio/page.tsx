import { redirect } from "next/navigation";

// The Studio has one instrument so far; /studio opens it.
export default function StudioPage() {
  redirect("/studio/cube");
}
