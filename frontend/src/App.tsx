import { NavLink, Route, Routes } from 'react-router-dom'
import './App.css'
import ReviewPage from './pages/ReviewPage'
import UploadPage from './pages/UploadPage'

export default function App() {
  return (
    <div className="app">
      <header className="top">
        <strong className="brand">Extrato</strong>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Início
          </NavLink>
          <NavLink to="/revisao" className={({ isActive }) => (isActive ? 'active' : '')}>
            Revisão
          </NavLink>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/revisao" element={<ReviewPage />} />
        </Routes>
      </main>
    </div>
  )
}
