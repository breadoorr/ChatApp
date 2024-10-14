import Avatar from "./Avatar.jsx";

export default function Contact({userId, selected, username, onClick, online}) {
    return (
    <div key={userId} onClick={() => onClick(userId)}
         className={"border-b border-gray-100 flex items-center gap-2 cursor-pointer " + (selected ? 'bg-blue-50' : '')}>
        {selected && (
            <div className="w-1 bg-blue-500 h-12 rounded-r-md"></div>
        )}
        <div className="flex py-2 pl-4 gap-2 items-center">
            <Avatar online={online} username={username}
                    userId={userId}/>
            <span
                className="text-gray-800">{username}</span>
        </div>
    </div>
    );
}