import './App.css'
import axios from "axios";
import {UserContextProvider} from "./UserContext.jsx";
import Routes from "./Routes.jsx";

function App() {
  axios.defaults.baseURL = 'https://chat-app-steel-two.vercel.app'
  axios.defaults.withCredentials = true

  return (
      <UserContextProvider>
          <Routes/>
      </UserContextProvider>
  )
}

export default App
