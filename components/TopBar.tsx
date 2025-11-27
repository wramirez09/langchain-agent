import Image from "next/image";
import logo from "@/public/images/logo-main.svg";
import * as React from 'react';
import { LogoutButton } from "./logout-button";
import ManageBillingButton from "./ui/ManageBillingButton";



const TopBar: React.FC = () => {
    return (

        <div className="grid grid-cols-[1fr,auto] gap-2 px-4 py-2 md:py-3 bg-gradient-light items-center z-50 border-b border-gray-200 shadow-md">
            <div className="flex gap-4 flex-col md:flex-row md:items-center ml-2">
                <a
                    href="/"
                    rel="noopener noreferrer"
                    target="_blank"
                    className="flex items-center gap-2"
                >
                    <Image
                        src={logo}
                        alt="NoteDoctor.Ai Logo"
                        className="h-5 md:h-8 w-auto"
                    />
                    <span className="text-xs md:text-md text-dark font-bold">NoteDoctor.Ai</span>
                </a>
            </div>
            <div className="flex-col items-center justify-end gap-2">

                <LogoutButton />

            </div>
        </div>


    );
}

export default TopBar;