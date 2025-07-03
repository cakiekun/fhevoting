import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/ThemeProvider";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="relative h-9 w-9 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
    >
      {/* Sun icon - visible in light mode */}
      <Sun className={`h-[1.2rem] w-[1.2rem] transition-all duration-300 ${
        theme === "light" 
          ? "rotate-0 scale-100 text-orange-500" 
          : "rotate-90 scale-0 text-transparent"
      }`} />
      
      {/* Moon icon - visible in dark mode */}
      <Moon className={`absolute h-[1.2rem] w-[1.2rem] transition-all duration-300 ${
        theme === "dark" 
          ? "rotate-0 scale-100 text-blue-400" 
          : "rotate-90 scale-0 text-transparent"
      }`} />
      
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}