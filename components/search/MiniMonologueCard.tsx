import { Monologue } from "@/types/actor";
import { Badge } from "@/components/ui/badge";
import { isMeaningfulMonologueTitle } from "@/lib/utils";

interface MiniMonologueCardProps {
  monologue: Monologue;
}

export default function MiniMonologueCard({ monologue }: MiniMonologueCardProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded border border-border hover:bg-muted transition-colors text-xs">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {monologue.character_name}
        </div>
        {isMeaningfulMonologueTitle(monologue.title, monologue.character_name) && (
          <div className="text-foreground/80 truncate text-[10px]">
            {monologue.title}
          </div>
        )}
        <div className="text-muted-foreground truncate text-[10px]">
          {monologue.play_title}
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        {monologue.category && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
            {monologue.category}
          </Badge>
        )}
        {monologue.character_gender && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
            {monologue.character_gender}
          </Badge>
        )}
      </div>
    </div>
  );
}
