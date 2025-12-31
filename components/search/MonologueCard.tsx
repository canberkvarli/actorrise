"use client";

import { Monologue } from "@/types/actor";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { IconExternalLink, IconSparkles } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

interface MonologueCardProps {
  monologue: Monologue;
  index?: number;
}

export function MonologueCard({ monologue, index = 0 }: MonologueCardProps) {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <motion.div
        whileHover={{ scale: 1.02, y: -4 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="hover:shadow-xl transition-all duration-300 hover:border-primary/50 h-full flex flex-col">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-xl mb-2">{monologue.title}</CardTitle>
                <CardDescription className="text-base">by {monologue.author}</CardDescription>
              </div>
              {monologue.relevance_score !== undefined && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={inView ? { scale: 1 } : { scale: 0 }}
                  transition={{ delay: index * 0.1 + 0.2, type: "spring" }}
                  className="flex flex-col items-end gap-2"
                >
                  <div className="flex items-center gap-1 text-primary">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    >
                      <IconSparkles className="h-4 w-4" />
                    </motion.div>
                    <span className="text-sm font-medium">
                      {Math.round(monologue.relevance_score * 100)}% match
                    </span>
                  </div>
                  <div className="w-20">
                    <Progress value={monologue.relevance_score * 100} className="h-1.5" />
                  </div>
                </motion.div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{monologue.age_range}</Badge>
              <Badge variant="outline">{monologue.gender}</Badge>
              <Badge variant="outline">{monologue.genre}</Badge>
              <Badge variant="outline">{monologue.difficulty}</Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {monologue.excerpt}
            </p>
          </CardContent>
          <CardFooter className="flex justify-between mt-auto">
            {monologue.source_url && (
              <motion.a
                href={monologue.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
                whileHover={{ x: 4 }}
                transition={{ duration: 0.2 }}
              >
                View Source
                <IconExternalLink className="h-3 w-3" />
              </motion.a>
            )}
            {monologue.full_text_url && (
              <motion.a
                href={monologue.full_text_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
                whileHover={{ x: 4 }}
                transition={{ duration: 0.2 }}
              >
                Full Text
                <IconExternalLink className="h-3 w-3" />
              </motion.a>
            )}
          </CardFooter>
        </Card>
      </motion.div>
    </motion.div>
  );
}

