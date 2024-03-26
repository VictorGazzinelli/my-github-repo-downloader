const axios = require("axios");
const fs = require("fs");
const path = require("path");
const unzipper = require('unzipper');
const archiver = require('archiver');

async function getDefaultBranch(name, token) {
	const apiUrl = `https://api.github.com/repos/${name}`;
	const response = await axios.get(apiUrl, {
		headers: { Authorization: `token ${token}` },
	});
	return response.data.default_branch;
}

async function cloneGithubRepoAsZip(name, token) {
	const defaultBranch = await getDefaultBranch(name, token);
	const apiUrl = `https://api.github.com/repos/${name}/zipball/${defaultBranch}`;
	const tempDownloadPath = `./${name.replace('/','_')}-temp.zip`;
	const finalZipPath = `./${name.replace('/','_')}.zip`;
	try {
		const response = await axios({
		  url: apiUrl,
		  method: 'GET',
		  responseType: 'stream',
		  headers: {
			'Authorization': `token ${token}`,
			'Accept': 'application/vnd.github.v3+json'
		  }
		});
		const writer = fs.createWriteStream(tempDownloadPath);
		response.data.pipe(writer);
		await new Promise((resolve, reject) => {
		  writer.on('finish', resolve);
		  writer.on('error', reject);
		});
		const tempExtractPath = `./${name.replace('/','_')}-temp`;
		await fs.promises.mkdir(tempExtractPath, { recursive: true });
		await fs.createReadStream(tempDownloadPath)
		  .pipe(unzipper.Extract({ path: tempExtractPath })).promise();
		const rootFolders = await fs.promises.readdir(tempExtractPath);
		const output = fs.createWriteStream(finalZipPath);
		const archive = archiver('zip', { zlib: { level: 9 }});
		archive.pipe(output);
		for (const folder of rootFolders) {
		  const fullFolderPath = path.join(tempExtractPath, folder);
		  if (fs.lstatSync(fullFolderPath).isDirectory()) {
			archive.directory(fullFolderPath, false);
		  } else {
			archive.file(fullFolderPath, { name: folder });
		  }
		}
		await archive.finalize();
		fs.rmSync(tempDownloadPath);
		fs.rmSync(tempExtractPath, { recursive: true, force: true });
	} catch (error) {
		console.error("Error cloning repository:", error);
	}
}

function splitArrayIntoChunks(array, chunkSize) {
    let result = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      let chunk = array.slice(i, i + chunkSize);
      result.push(chunk);
    }
    return result;
}

async function main() {
    // special cases: "vitejs/vite" "neherlab/covid19_scenarios"
	const repos = ["neherlab/covid19_scenarios"]
    const token = process.env.GITHUB_TOKEN;
    const reposInPages = splitArrayIntoChunks(repos, 1);
    for(const page of reposInPages)
    {
        await Promise.all(page.map(async (repo) => {
            await cloneGithubRepoAsZip(repo, token);
        }));
    }
}

main().catch(console.error);