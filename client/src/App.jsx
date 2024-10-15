import './App.css'
import axios from "axios";
import {UserContextProvider} from "./UserContext.jsx";
import Routes from "./Routes.jsx";

axios.defaults.baseURL = 'https://chat-app-front-orcin.vercel.app/api/'
axios.defaults.withCredentials = true
function App() {
  return (
      <UserContextProvider>
          <Routes/>
      </UserContextProvider>
  )
}

export default App
