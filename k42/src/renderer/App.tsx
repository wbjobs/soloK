import { Routes, Route } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import AppLayout from './components/Layout/AppLayout'
import Dashboard from './pages/Dashboard'
import Mappings from './pages/Mappings'
import Settings from './pages/Settings'

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

const pageTransition = {
  type: 'tween',
  ease: 'anticipate',
  duration: 0.3,
}

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}

export default function App() {
  return (
    <AppLayout>
      <AnimatePresence mode="wait">
        <Routes>
          <Route
            path="/"
            element={
              <AnimatedPage>
                <Dashboard />
              </AnimatedPage>
            }
          />
          <Route
            path="/mappings"
            element={
              <AnimatedPage>
                <Mappings />
              </AnimatedPage>
            }
          />
          <Route
            path="/settings"
            element={
              <AnimatedPage>
                <Settings />
              </AnimatedPage>
            }
          />
        </Routes>
      </AnimatePresence>
    </AppLayout>
  )
}
