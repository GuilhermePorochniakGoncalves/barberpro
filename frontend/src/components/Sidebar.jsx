import { Link, useLocation } from "react-router-dom";

function Sidebar() {
  const location = useLocation();

  const menus = [
    { nome: "Dashboard", caminho: "/" },
    { nome: "Barbeiros", caminho: "/barbeiros" },
    { nome: "Clientes", caminho: "/clientes" },
    { nome: "Relatórios", caminho: "/relatorios" },
  ];

  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen p-6">
      <h1 className="text-3xl font-bold mb-10 text-green-400">
        BarberPro
      </h1>

      <nav className="space-y-2">
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
                ativo ? "bg-green-600" : "hover:bg-gray-800"
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
