

import Image from "next/image";
import logo from "@/public/images/logo-main.svg";
import * as React from 'react';
import { LogoutButton } from "./logout-button";


const TopBar: React.FC = () => {

<<<<<<< Updated upstream
    return <div className="grid grid-cols-[1fr,auto] gap-2 px-4 py-2 md:py-3">
=======
    return <div className="grid grid-cols-[1fr,auto] gap-2 px-4 py-2 md:py-3 bg-gradient-light">
>>>>>>> Stashed changes
        <div className="flex gap-4 flex-col md:flex-row md:items-center ml-2">
            <a
                href=""
                rel="noopener noreferrer"
                target="_blank"
                className="flex items-center gap-2"
            >
                <Image
                    src={logo}
                    alt="NoteDoctor.Ai Logo"
                    className="h-5 md:h-8 w-auto "
                />
<<<<<<< Updated upstream
                <span className="text-xs md:text-md text-black">NoteDoctor.Ai</span>
=======
                <span className="text-xs md:text-md text-dark font-bold">NoteDoctor.Ai</span>
>>>>>>> Stashed changes
            </a>
        </div>
        <LogoutButton />
    </div>
}


export default TopBar