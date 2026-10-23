import { lazy, Suspense, useEffect } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import Layout from '@/components/Layout'
import Today from '@/routes/Today'
import Install, { InstallProvider } from '@/routes/Install'
import { useProfile } from '@/hooks/data'
import { syncStatusBar } from '@/lib/android'

const Timetable = lazy(() => import('@/routes/Timetable'))
const Attendance = lazy(() => import('@/routes/Attendance'))
const Tasks = lazy(() => import('@/routes/Tasks'))
const Grades = lazy(() => import('@/routes/Grades'))
const Planner = lazy(() => import('@/routes/Planner'))
const Review = lazy(() => import('@/routes/Review'))
const Notes = lazy(() => import('@/routes/Notes'))
const Focus = lazy(() => import('@/routes/Focus'))
const Courses = lazy(() => import('@/routes/Courses'))
const Coach = lazy(() => import('@/routes/Coach'))
const Applications = lazy(() => import('@/routes/Applications'))
const Resume = lazy(() => import('@/routes/Resume'))
const Money = lazy(() => import('@/routes/Money'))
const CourseDetail = lazy(() => import('@/routes/CourseDetail'))
const Settings = lazy(() => import('@/routes/Settings'))
const Tutor = lazy(() => import('@/routes/Tutor'))

function Loading() {
  return <div className="py-16 text-center text-[13.5px] text-ink-3">Loading…</div>
}

function wrap(node: React.ReactNode) {
  return <Suspense fallback={<Loading />}>{node}</Suspense>
}

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Today /> },
      { path: 'timetable', element: wrap(<Timetable />) },
      { path: 'attendance', element: wrap(<Attendance />) },
      { path: 'tasks', element: wrap(<Tasks />) },
      { path: 'grades', element: wrap(<Grades />) },
      { path: 'planner', element: wrap(<Planner />) },
      { path: 'review', element: wrap(<Review />) },
      { path: 'notes', element: wrap(<Notes />) },
      { path: 'focus', element: wrap(<Focus />) },
      { path: 'coach', element: wrap(<Coach />) },
      { path: 'tutor', element: wrap(<Tutor />) },
      { path: 'courses', element: wrap(<Courses />) },
      { path: 'applications', element: wrap(<Applications />) },
      { path: 'resume', element: wrap(<Resume />) },
      { path: 'money', element: wrap(<Money />) },
      { path: 'courses/:id', element: wrap(<CourseDetail />) },
      { path: 'settings', element: wrap(<Settings />) },
      { path: 'install', element: <Install /> },
      { path: '*', element: <Today /> },
    ],
  },
])

export default function App() {
  const profile = useProfile()

  useEffect(() => {
    const root = document.documentElement
    if (profile.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', profile.theme)
    void syncStatusBar(profile.theme)
  }, [profile.theme])

  return <InstallProvider><RouterProvider router={router} /></InstallProvider>
}
