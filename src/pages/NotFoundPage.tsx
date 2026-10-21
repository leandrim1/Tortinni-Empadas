import { Link } from 'react-router-dom';
import { ChefHat } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center pt-[68px] text-center">
      <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gold-100 text-gold-700">
        <ChefHat size={34} aria-hidden="true" />
      </span>
      <p className="font-display text-6xl font-extrabold text-brand-800">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold">Essa página saiu do forno</h1>
      <p className="mt-2 max-w-sm text-sm text-night-900/60 text-pretty">
        Não encontramos o que você procurava — mas o cardápio está cheio de coisa boa.
      </p>
      <div className="mt-7 flex flex-col gap-2 sm:flex-row">
        <Link to="/cardapio" className="btn-primary btn-lg">
          Ver cardápio
        </Link>
        <Link to="/" className="btn-ghost btn-lg">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
