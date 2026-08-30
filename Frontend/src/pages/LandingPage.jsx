import { Link } from "react-router-dom"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fdfbf7] via-[#f5e6e8] to-[#2c2c2c] font-sans">
      <header className="absolute top-0 w-full flex justify-between items-center p-6 z-10">
        <div className="text-2xl font-bold text-gray-900 drop-shadow-sm">Collab Editor</div>
        <nav className="flex gap-4">
          <Link to="/login" className="px-5 py-2 text-sm font-semibold text-gray-800 bg-[#f5e6e8] rounded-full hover:bg-[#e8d5d8] transition shadow-sm border border-gray-200">
            Login
          </Link>
        </nav>
      </header>

      <main className="flex flex-col items-center justify-center min-h-screen text-center px-4 pt-20">
        <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 mb-6 drop-shadow-md">
          Code Together, <span className="text-[#d8a7b1]">Anywhere.</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-800 max-w-2xl mb-10 drop-shadow-sm bg-white/30 p-4 rounded-xl backdrop-blur-sm border border-white/40">
          Experience a modern, high-performance, real-time collaborative code editor and cloud IDE.
          Built with CRDT-based synchronization, Dockerized code execution sandboxes, and AI-powered coding assistance.
        </p>

        <div className="flex gap-4 flex-col sm:flex-row">
          <Link to="/login" className="px-8 py-4 text-lg font-bold text-[#fdfbf7] bg-[#2c2c2c] rounded-full hover:bg-gray-800 transition shadow-xl">
            Get Started for Free
          </Link>
          <a href="#features" className="px-8 py-4 text-lg font-bold text-gray-900 bg-[#f5ecdf] rounded-full hover:bg-[#eaddce] transition shadow-xl border border-gray-200">
            Explore Features
          </a>
        </div>
      </main>

      <section id="features" className="bg-[#2c2c2c] text-[#fdfbf7] py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16 text-[#f5e6e8]">Why Choose Collab Editor?</h2>

          <div className="grid md:grid-cols-3 gap-10">
            <div className="bg-[#3a3a3a] p-8 rounded-2xl shadow-lg border border-gray-600">
              <div className="text-[#f5e6e8] text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-bold mb-3 text-[#fdfbf7]">Real-Time Collaboration</h3>
              <p className="text-gray-300">Conflict-free multi-user live editing, cursor tracking, and presence awareness powered by Yjs.</p>
            </div>

            <div className="bg-[#3a3a3a] p-8 rounded-2xl shadow-lg border border-gray-600">
              <div className="text-[#f5ecdf] text-4xl mb-4">🐳</div>
              <h3 className="text-xl font-bold mb-3 text-[#fdfbf7]">Sandboxed Execution</h3>
              <p className="text-gray-300">Isolated Docker container execution with multiple language support (JS, Python, Java, C++, Go, Ruby).</p>
            </div>

            <div className="bg-[#3a3a3a] p-8 rounded-2xl shadow-lg border border-gray-600">
              <div className="text-[#d8a7b1] text-4xl mb-4">🤖</div>
              <h3 className="text-xl font-bold mb-3 text-[#fdfbf7]">AI Assistant</h3>
              <p className="text-gray-300">Integrated LLM assistance for code explanation, bug detection, and automated optimizations.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-gray-950 text-gray-400 py-8 text-center text-sm border-t border-gray-800">
        <p>© {new Date().getFullYear()} Collab Editor. All rights reserved.</p>
      </footer>
    </div>
  )
}
