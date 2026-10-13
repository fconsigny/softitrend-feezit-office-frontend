import { useEffect, useState } from "react";
import { isAborted } from "./api.js";
export function useResource(client, path, revision = 0) {
  const [state, setState] = useState({
    path: null,
    revision: -1,
    data: null,
    loading: true,
    error: "",
  });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let active = true;
    setState({ path, revision, data: null, loading: true, error: "" });
    client.management(path, { signal: controller.signal }).then(
      (data) => {
        if (active)
          setState({ path, revision, data, loading: false, error: "" });
      },
      (error) => {
        if (active && !isAborted(error))
          setState({
            path,
            revision,
            data: null,
            loading: false,
            error: error.message,
          });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, path, revision]);
  if (!path) return { data: null, loading: false, error: "" };
  if (state.path !== path || state.revision !== revision)
    return { data: null, loading: true, error: "" };
  return state;
}
