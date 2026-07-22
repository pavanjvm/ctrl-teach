import { redirect } from "next/navigation";

export default function LegacyCourseFactoryPage() {
  redirect("/library?create=1");
}
