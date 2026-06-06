// Root route just sends visitors to the student dashboard.
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/student');
}
