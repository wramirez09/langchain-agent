'use client'
import { useState } from "react";
import {

  IconHome2,

} from "@tabler/icons-react";

// import { MantineLogo } from "@mantinex/mantine-logo";
import classes from "./NavbarMinimal.module.css";
import { z } from "zod";
import { Button } from "../button";

interface NavbarLinkProps {
  icon: typeof IconHome2;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function NavbarLink({ icon: Icon, label, active, onClick }: NavbarLinkProps) {
  return (
    // <Tooltip
    //   label={label}
    //   position="right"
    //   transitionProps={{ duration: 0 }}
    //   style={{ zIndex: 2000 }}
    // >
    <Button
      onClick={onClick}
      className={classes.link}
      data-active={active || undefined}
      variant={"ghost"}
    >
      <Icon size={20} stroke={1.5} />
    </Button>
    // </Tooltip>
  );
}

const mockdata = [
  { icon: IconHome2, label: "Home" },
  // { icon: IconGauge, label: "Dashboard" },
  // { icon: IconDeviceDesktopAnalytics, label: "Analytics" },
  // { icon: IconCalendarStats, label: "Releases" },
  // { icon: IconUser, label: "Account" },
  // { icon: IconFingerprint, label: "Security" },
  // { icon: IconSettings, label: "Settings" },
];

export function NavbarMinimal() {
  const [active, setActive] = useState(2);

  const links = mockdata.map((link, index) => (
    <NavbarLink
      {...link}
      key={link.label}
      active={index === active}
      onClick={() => setActive(index)}
    />
  ));

  return (
    <></>
    // <nav className={`${classes.navbar} hidden md:block`}>
    //   <Center>{/* <MantineLogo type="mark" size={30} /> */}</Center>

    //   <div className={classes.navbarMain}>
    //     <Stack justify="center" gap={0}>
    //       {links}
    //     </Stack>
    //   </div>

    //   <Stack justify="center" gap={0}>
    //     {/* <NavbarLink icon={IconSwitchHorizontal} label="Change account" />
    //     <NavbarLink icon={IconLogout} label="Logout" /> */}
    //   </Stack>
    // </nav>
  );
}
