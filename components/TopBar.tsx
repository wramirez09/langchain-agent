'use client'
import Image from "next/image";
import logo from "@/public/images/ndLogo.png";
import * as React from 'react';
import { LogoutButton } from "./logout-button";



const TopBar: React.FC = () => {
    return (

        <div className="grid grid-cols-[1fr,auto] gap-2 px-4 py-2 md:py-3 bg-gradient-light items-center z-50 border-b border-gray-200 shadow-md">
            <div className="flex gap-6 flex-col md:flex-row md:items-center ml-2">
                <a
                    id="logo-home-link"
                    href="/"
                    rel="noopener noreferrer"
                    target="_blank"
                    className="flex items-center gap-2"
                >
                    <Image
                        src={logo}
                        alt="NoteDoctor.ai Logo"
                        className="h-5 md:h-8 w-auto"
                    />
                    <span className="text-sm md:text-md text-dark font-bold">NoteDoctor.ai</span>
                </a>
            </div>
            <div className="flex-col items-center justify-end gap-2">

                <LogoutButton />

            </div>
        </div>


    );
}

export default TopBar;