import {useContext, useState} from "react";
import axios from "axios";
import {UserContext} from "./UserContext.jsx";

export default function RegisterAngLoginForm() {

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isLoginOrRegister, setIsLoginOrRegister] = useState('register')
    const {setUsername: setLoggedInUsername, setId} = useContext(UserContext);
    async function handleSubmit(ev) {
        ev.preventDefault();
        const url = isLoginOrRegister === 'register' ? 'register' : 'login';
        try {
            const { data } = await axios.post(url, { username, password });
            setLoggedInUsername(username); // Set the username in context
            setId(data.userId); // Assuming the API returns userId
        } catch (error) {
            console.error("Registration error:", error.response ? error.response.data : error.message);
            // Handle error display here (e.g., show an error message to the user)
        }
    }
    return (
        <div className="bg-blue-50 h-screen flex items-center">
            <form className="w-64 mx-auto mb-12" onSubmit={handleSubmit}>
                <input value={username}
                       onChange={ev => setUsername(ev.target.value)}
                       type="text"
                       placeholder="Username"
                       className="block w-full rounded-sm p-2 mb-2 border"/>
                <input value={password}
                       onChange={ev => setPassword(ev.target.value)}
                       type="password"
                       placeholder="Password"
                       className="block w-full rounded-sm p-2 mb-2 border"/>
                <button className="bg-blue-500 text-white block w-full rounded-sm p-2">
                    {isLoginOrRegister === 'register' ? 'Register': 'Login'}
                </button>
                {isLoginOrRegister === 'register' && (
                    <div className="text-center mt-2">
                        Already a member?

                        <button className="ml-1" onClick={() => setIsLoginOrRegister('login')}>
                            Login here
                        </button>
                    </div>
                )}

                {isLoginOrRegister === 'login' && (
                    <div className="text-center mt-2">
                        Do not have an account?

                        <button className="ml-1" onClick={() => setIsLoginOrRegister('register')}>
                            Register
                        </button>
                    </div>
                )}
            </form>
        </div>
    )
}