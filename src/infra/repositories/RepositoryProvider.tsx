import { Repositories } from "@/src/domain/Repositories";
import React from "react";

/*
  Criando contexto para injeção de depedências. 
*/
export const RepositoryContext = React.createContext<Repositories>(
  {} as Repositories // > export const RepositoryContext = React.createContext<Repositories | undefined>(undefined);
);

export const RepositoryProvider = RepositoryContext.Provider;

export function useRepository(): Repositories {
  // Aproveitando a nova api do react 19 com react.use; podendo usar somente o { use }
  const context = React.use(RepositoryContext);

  if (!context) {
    throw new Error(
      "Repository Context should be used within a RepositoryProvider"
    );
  }

  return context;
}