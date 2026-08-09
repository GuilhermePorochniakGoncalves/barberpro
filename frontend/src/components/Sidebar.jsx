import { Link, useLocation } from "react-router-dom";

function Sidebar({ aberta = false, onFechar }) {
  const location = useLocation();

  const menus = [
    { nome: "Dashboard", caminho: "/" },
    { nome: "Barbeiros", caminho: "/barbeiros" },
    { nome: "Produtos", caminho: "/produtos" },
    { nome: "Clientes", caminho: "/clientes" },
    { nome: "Relatórios", caminho: "/relatorios" },
  ];

  return (
    <>
      {/* Fundo escurecido atrás do menu — só em telas pequenas, com o menu aberto. */}
      {aberta && (
        <div
          className="fixed inset-0 bg-black/70 z-30 md:hidden"
          onClick={onFechar}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-black border-r border-zinc-900 text-zinc-100 min-h-screen p-6 flex flex-col transform transition-transform duration-200 md:translate-x-0 ${
          aberta ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-3xl font-bold text-amber-500 tracking-tight">
            BarberPro
          </h1>
          <button
            onClick={onFechar}
            className="md:hidden text-zinc-500 hover:text-zinc-300 text-2xl leading-none"
            aria-label="Fechar menu"
          >
            ×
          </button>
        </div>

        <nav className="space-y-2 flex-1">
          {menus.map((menu) => {
            const ativo =
              menu.caminho === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(menu.caminho);

            return (
              <Link
                key={menu.nome}
                to={menu.caminho}
                onClick={onFechar}
                className={`block px-4 py-3 rounded-xl transition ${
                  ativo
                    ? "bg-amber-600 text-black font-semibold"
                    : "text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                {menu.nome}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}

export default Sidebar;
