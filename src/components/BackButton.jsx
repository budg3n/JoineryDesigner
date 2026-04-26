import { useNavigate } from 'react-router-dom'

export default function BackButton({ to, label = 'Back' }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => to ? navigate(to) : navigate(-1)}
      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-100 mb-4 cursor-pointer bg-transparent border-none">
      ← {label}
    </button>
  )
}
