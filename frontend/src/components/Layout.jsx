import Sidebar from "./Sidebar";

function Layout({ children }) {
  return (
    <div className="flex bg-gray-100 min-h-screen">
      <Sidebar />

      <div className="flex-1 p-8">
        {children}
      </div>
    </div>
  );
}

export default Layout;