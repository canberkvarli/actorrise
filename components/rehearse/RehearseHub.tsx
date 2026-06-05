"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScenesTab } from "@/components/rehearse/ScenesTab";
import { MonologuesTab } from "@/components/rehearse/MonologuesTab";
import { SavedTab } from "@/components/rehearse/SavedTab";

const TABS = ["scenes", "monologues", "saved"] as const;
type TabValue = (typeof TABS)[number];

function isTabValue(v: string | null): v is TabValue {
  return v !== null && (TABS as readonly string[]).includes(v);
}

export function RehearseHub() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab: TabValue = isTabValue(tabParam) ? tabParam : "scenes";

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`/rehearse?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Rehearse</h1>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="scenes">Scenes</TabsTrigger>
          <TabsTrigger value="monologues">Monologues</TabsTrigger>
          <TabsTrigger value="saved">Saved</TabsTrigger>
        </TabsList>

        <TabsContent value="scenes" className="mt-8">
          <ScenesTab />
        </TabsContent>
        <TabsContent value="monologues" className="mt-8">
          <MonologuesTab />
        </TabsContent>
        <TabsContent value="saved" className="mt-8">
          <SavedTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
