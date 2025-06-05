


export async function getNCDArticles() {
    const endpoint = "https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/"
    

    try {
        const data = await fetch(endpoint, {
            method: "GET",
            headers: { contentType: "application/json" },
            cache: "no-store",

        });

        if (!data.ok) {
            throw new Error(`Error fetching NCD articles: ${data.statusText}`);
        }
        const response = await data.json();
        console.log({response});
        debugger
        return response;
    } catch (error) {
        console.error("Error fetching NCD articles:", error);
     }

}