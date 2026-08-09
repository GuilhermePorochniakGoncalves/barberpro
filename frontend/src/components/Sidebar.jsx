import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { barbeiroLogado, logout } = useAuth();

  const menus = [
    { nome: "Dashboard", caminho: "/" },
    { nome: "Barbeiros", caminho: "/barbeiros" },
    { nome: "Clientes", caminho: "/clientes" },
    { nome: "Relatórios", caminho: "/relatorios" },
  ];

  // Só aparecem pra quem está logado (a rota também é protegida — isso é
  // só pra não oferecer um link que vai barrar em seguida).
  const menusLogado = [
    { nome: "Meus serviços", caminho: "/meus-servicos" },
    { nome: "Produtos", caminho: "/produtos" },
  ];

  async function sair() {
    await logout();
    navigate("/");
  }

  return (
    <div className="w-64 bg-black border-r border-zinc-900 text-zinc-100 min-h-screen p-6 flex flex-col">
      <h1 className="text-3xl font-bold mb-10 text-amber-500 tracking-tight">
        BarberPro
      </h1>

      <nav className="space-y-2 flex-1">
        {[...menus, ...(barbeiroLogado ? menusLogado : [])].map((menu) => {
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

      <div className="border-t border-zinc-900 pt-4">
        {barbeiroLogado ? (
          <div className="space-y-2">
            <p className="px-4 text-sm text-zinc-500">Logado como {barbeiroLogado.nome}</p>
            <button
              onClick={sair}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-zinc-900 text-zinc-300"
            >
              Sair
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="block px-4 py-3 rounded-xl hover:bg-zinc-900 text-zinc-300"
          >
            Login do barbeiro
          </Link>
        )}
      </div>
    </div>
  );
}

export default Sidebar;
