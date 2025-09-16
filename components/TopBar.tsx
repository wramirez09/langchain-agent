

import Image from "next/image";
import logo from "@/public/images/logo-main.svg";
import * as React from 'react';
import { LogoutButton } from "./logout-button";


const TopBar: React.FC = () => {

    return <div className="grid grid-cols-[1fr,auto] gap-2 px-4 py-2 md:py-3">
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
                <span className="text-xs md:text-md text-black">NoteDoctor.Ai</span>
            </a>
        </div>
        <LogoutButton />
    </div>
}


export default TopBar