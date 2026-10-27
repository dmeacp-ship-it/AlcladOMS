import { redirect } from 'next/navigation'

// Everyone starts on To Do Today: the work waiting for their job.
export default function Home() {
  redirect('/today')
}
