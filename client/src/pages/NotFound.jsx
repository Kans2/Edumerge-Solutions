import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="card p-12 text-center">
      <p className="text-4xl font-semibold text-slate-300">404</p>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">We could not find that page</h1>
      <Link to="/" className="btn-primary mt-5 inline-flex">Back to home</Link>
    </div>
  );
}
