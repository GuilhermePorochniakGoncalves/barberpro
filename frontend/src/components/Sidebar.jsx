import { Link, useLocation } from "react-router-dom";

function Sidebar() {
  const location = useLocation();

  const menus = [
    { nome: "Dashboard", caminho: "/" },
    { nome: "Barbeiros", caminho: "/barbeiros" },
    { nome: "Produtos", caminho: "/produtos" },
    { nome: "Clientes", caminho: "/clientes" },
    { nome: "Relatórios", caminho: "/relatorios" },
  ];

  return (
    <div className="w-64 bg-black border-r border-zinc-900 text-zinc-100 min-h-screen p-6 flex flex-col">
      <h1 className="text-3xl font-bold mb-10 text-amber-500 tracking-tight">
        BarberPro
      </h1>

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
  );
}

export default Sidebar;
